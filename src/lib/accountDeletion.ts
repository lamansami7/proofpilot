import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { readSnapshot, storageKeyFor } from './localPurchaseStore';
import { documentUris } from './documentCleanup';
import { removeUnreferencedFile } from './fileMaintenance';
import { withStorageLock } from './storageTransaction';
const PREFIX = 'proofpilot.v1.account-purge.';
type Purge = { userId: string; confirmed: boolean; files: string[] };
export const accountDeletionEnabled = Boolean(supabase) && process.env.EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED === 'true';

function parsePurge(raw: string, key: string): Purge {
  const purge = JSON.parse(raw) as Purge;
  if (!purge || typeof purge.userId !== 'string' || typeof purge.confirmed !== 'boolean' || key !== PREFIX + purge.userId || !Array.isArray(purge.files) || purge.files.some(uri => typeof uri !== 'string')) throw new Error('Device cleanup needs support; saved data has not been overwritten.');
  return purge;
}

async function finishPurge(key: string, purge: Purge) {
  if (!purge.confirmed) return;
  // Keep the confirmed ledger until both credentials and managed data are gone.
  // A returned Auth error is not a successful sign-out. Never sign out another account.
  if (supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user.id === purge.userId) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
    }
  }
  await withStorageLock(storageKeyFor(purge.userId), () => AsyncStorage.removeItem(storageKeyFor(purge.userId)));
  for (const uri of purge.files) await removeUnreferencedFile(uri);
  await AsyncStorage.removeItem(key);
}
export async function resumeConfirmedPurges() {
  let unconfirmed = 0;
  for (const key of (await AsyncStorage.getAllKeys()).filter(value => value.startsWith(PREFIX))) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    const purge = parsePurge(raw, key);
    if (!purge.confirmed) unconfirmed++;
    await finishPurge(key,purge);
  }
  return { unconfirmed };
}
/** Caller must suspend the account store first; passwords are never persisted. */
export async function deleteCurrentAccount(password: string): Promise<{ localCleanupPending: boolean }> {
  if (!supabase || !accountDeletionEnabled) throw new Error('Account deletion is not enabled in this build.');
  const { data: current,error: authError } = await supabase.auth.getUser();
  if (authError || !current.user?.email) throw new Error('Sign in again before deleting your account.');
  const { data,error } = await supabase.auth.signInWithPassword({ email:current.user.email,password });
  if (error || data.user?.id !== current.user.id || !data.session) throw new Error('Password verification failed. Nothing was deleted.');
  const userId = data.user.id; const key = PREFIX + userId;
  const snapshot = readSnapshot(await AsyncStorage.getItem(storageKeyFor(userId)));
  const previous = await AsyncStorage.getItem(key);
  const previousFiles: string[] = previous ? parsePurge(previous, key).files : [];
  const purge: Purge = { userId,confirmed:false,files:[...new Set([...documentUris(snapshot.items),...(snapshot.cleanup ?? []),...previousFiles])] };
  await AsyncStorage.setItem(key,JSON.stringify(purge));
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(),30000);
  try {
    const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,{
      method:'POST', signal:controller.signal, redirect:'error',
      headers: { Authorization:`Bearer ${data.session.access_token}`, apikey:process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, 'Content-Type':'application/json' },
      body:JSON.stringify({ confirmation:'DELETE' }),
    });
    if (!response.ok || (await response.json()).deleted !== true) throw new Error('Deletion did not finish. Retry with your password. Cloud writes may be paused until deletion completes.');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Deletion')) throw error;
    throw new Error('The deletion response could not be confirmed. Do not assume the account was kept or deleted. Retry; contact private support if sign-in is no longer possible.');
  } finally { clearTimeout(timer); }
  purge.confirmed = true;
  // Persist the recovery ledger before clearing records. A failed cleanup never masquerades as success.
  let pending = false;
  try { await AsyncStorage.setItem(key,JSON.stringify(purge)); await finishPurge(key,purge); }
  catch { pending = true; }
  return { localCleanupPending:pending };
}
