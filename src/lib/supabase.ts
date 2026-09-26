import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
// Never use AsyncStorage for authentication secrets. Web uses Supabase's browser
// storage (not encrypted); native sessions use Keychain / Android Keystore.
const nativeStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};
export const supabase = url && anonKey ? createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: Platform.OS === 'web',
    ...(Platform.OS !== 'web' ? { storage: nativeStorage } : {}),
  },
}) : null;

/** Freeze the authenticated identity for an entire sync attempt. A sign-out or
 * account switch must never send the old account's queued data as the new user. */
export async function clientForAccount(owner: string) {
  if (!supabase || !url || !anonKey) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== owner) throw new Error('The account changed. Retry sync after signing in.');
  const token = data.session.access_token;
  return createClient(url, anonKey, { accessToken: async () => token });
}
