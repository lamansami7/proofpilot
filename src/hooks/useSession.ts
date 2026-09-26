import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useSession() {
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
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') client.auth.startAutoRefresh(); else client.auth.stopAutoRefresh();
    });
    return () => { active = false; clearTimeout(timer); data.subscription.unsubscribe(); subscription.remove(); };
  }, [attempt]);
  return {
    user, loading, error, recovery, configured: Boolean(supabase),
    retry: () => setAttempt(value => value + 1),
    signIn: (email: string, password: string) => supabase!.auth.signInWithPassword({ email, password }),
    signUp: (email: string, password: string) => supabase!.auth.signUp({ email, password }),
    resetPassword: async (email: string) => {
      if (Platform.OS !== 'web') throw new Error('Password reset is available from the web app. Native recovery links are not configured yet.');
      const { error: failure } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
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
