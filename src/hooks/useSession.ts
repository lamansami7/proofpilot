import { NATIVE_AUTH_REDIRECT, nativeRecoveryCode } from '../lib/authRedirect';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useSession() {
  const handledLink = useRef<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    let eventSeen = false;
    setLoading(true); setError(null);
    const timer = setTimeout(() => {
      if (active) { setError('Session restoration timed out. Check your connection and retry.'); setLoading(false); }
    }, 15000);
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      eventSeen = true;
      clearTimeout(timer);
      setUser(session?.user ?? null); setLoading(false); setError(null);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    // A locally restored session enables offline access to the account cache;
    // every network operation is still authenticated and checked by server RLS.
    client.auth.getSession().then(({ data: restored, error: failure }) => {
      if (!active || eventSeen) return;
      if (failure) throw failure;
      setUser(restored.session?.user ?? null); setLoading(false); clearTimeout(timer);
    }).catch(() => {
      if (!active || eventSeen) return;
      clearTimeout(timer); setError('Could not restore your session. Retry without clearing device data.'); setLoading(false);
    });
    const recover = async (url: string | null) => {
      if (!url || handledLink.current === url) return;
      const code = nativeRecoveryCode(url);
      if (!code) return;
      handledLink.current = url;
      try { const { error: failure } = await client.auth.exchangeCodeForSession(code); if (failure) throw failure; }
      catch { if (active) { setError('The recovery link could not be verified on this device. Request a new link from this app and open it here.'); setLoading(false); } }
    };
    const linkSubscription = Platform.OS !== 'web' ? Linking.addEventListener('url', event => { void recover(event.url); }) : null;
    if (Platform.OS !== 'web') void Linking.getInitialURL().then(recover).catch(() => { if (active) setError('Could not open the authentication link. Request a new link.'); });
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') client.auth.startAutoRefresh(); else client.auth.stopAutoRefresh();
    });
    return () => { active = false; clearTimeout(timer); data.subscription.unsubscribe(); subscription.remove(); linkSubscription?.remove(); };
  }, [attempt]);
  return {
    user, loading, error, recovery, configured: Boolean(supabase),
    retry: () => setAttempt(value => value + 1),
    signIn: (email: string, password: string) => supabase!.auth.signInWithPassword({ email, password }),
    signUp: (email: string, password: string) => supabase!.auth.signUp({ email, password, options: { emailRedirectTo: Platform.OS === 'web' ? window.location.origin : NATIVE_AUTH_REDIRECT } }),
    resetPassword: async (email: string) => {
      const { error: failure } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: Platform.OS === 'web' ? window.location.origin : NATIVE_AUTH_REDIRECT });
      if (failure) throw failure;
    },
    updatePassword: async (password: string) => {
      const { error: failure } = await supabase!.auth.updateUser({ password });
      if (failure) throw failure;
      setRecovery(false);
    },
    signOut: async () => {
      const { error: failure } = await supabase!.auth.signOut({ scope: 'local' });
      if (failure) throw failure;
    },
  };
}
