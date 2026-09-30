import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { readSnapshot, storageKeyFor } from './localPurchaseStore';
import { documentUris } from './documentCleanup';
import { removeUnreferencedFile } from './fileMaintenance';
import { withStorageLock } from './storageTransaction';
const PREFIX = 'proofpilot.v1.account-purge.';
const RECEIPT = /^[A-Za-z0-9_-]{43}$/;
type Purge = { userId: string; confirmed: boolean; files: string[]; receipt?: string };
export const accountDeletionEnabled = Boolean(supabase) && process.env.EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED === 'true';

function parsePurge(raw: string, key: string): Purge {
  const purge = JSON.parse(raw) as Purge;
  if (!purge || typeof purge.userId !== 'string' || typeof purge.confirmed !== 'boolean' || key !== PREFIX + purge.userId || !Array.isArray(purge.files) || purge.files.some(uri => typeof uri !== 'string')
    || (purge.receipt !== undefined && (typeof purge.receipt !== 'string' || !RECEIPT.test(purge.receipt)))) throw new Error('Device cleanup needs support; saved data has not been overwritten.');
  return purge;
}

/** 256-bit client-held secret. The server ever stores only its SHA-256 hash. */
function newReceipt(): string {
  const bytes = new Uint8Array(32);
  const webCrypto = globalThis.crypto as Crypto | undefined;
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') webCrypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); // same fallback supabase-js uses for PKCE
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function deletionRequest(body: Record<string, unknown>, accessToken?: string, timeoutMs = 30000): Promise<{ ok: boolean; payload: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY! };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST', signal: controller.signal, redirect: 'error',
      headers, body: JSON.stringify(body),
    });
    const payload: unknown = await response.json();
    return { ok: response.ok, payload };
  } finally { clearTimeout(timer); }
}

type ReceiptStatus = { state: 'completed'; userId: string } | { state: 'pending' } | { state: 'unknown' };
/** Asks the server whether THIS receipt's deletion completed. Never a sign-in attempt:
 *  a failed sign-in is not evidence of deletion. Returns null when unknowable (offline,
 *  malformed answer, missing endpoint) so callers keep the blocked/unconfirmed state. */
async function queryDeletionReceipt(receipt: string): Promise<ReceiptStatus | null> {
  if (!RECEIPT.test(receipt)) return null;
  try {
    const { ok, payload } = await deletionRequest({ receipt }, undefined, 10000);
    if (!ok || !payload || typeof payload !== 'object') return null;
    const body = payload as { deleted?: unknown; state?: unknown; userId?: unknown };
    if (body.deleted === true && body.state === 'completed' && typeof body.userId === 'string') return { state: 'completed', userId: body.userId };
    if (body.deleted === false && body.state === 'pending') return { state: 'pending' };
    if (body.deleted === false && body.state === 'unknown') return { state: 'unknown' };
    return null;
  } catch { return null; }
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
    // Lost-response recovery: only an exact server receipt bound to this account may
    // confirm deletion. Unknown/pending/failed probes stay blocked for private support.
    if (!purge.confirmed && purge.receipt) {
      const status = await queryDeletionReceipt(purge.receipt);
      if (status?.state === 'completed' && status.userId === purge.userId) {
        purge.confirmed = true;
        try { await AsyncStorage.setItem(key, JSON.stringify(purge)); }
        catch { /* keep unconfirmed: never purge without a durable confirmation. */ }
      }
    }
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
  const receipt = newReceipt();
  const purge: Purge = { userId,confirmed:false,files:[...new Set([...documentUris(snapshot.items),...(snapshot.cleanup ?? []),...previousFiles])],receipt };
  // Durable intent (files + receipt) must be on disk before any cloud work can start.
  await AsyncStorage.setItem(key,JSON.stringify(purge));
  let failure: Error | null = null;
  try {
    const { ok,payload } = await deletionRequest({ confirmation:'DELETE', receipt }, data.session.access_token);
    if (!ok || !payload || typeof payload !== 'object' || (payload as { deleted?: unknown }).deleted !== true) {
      failure = new Error('Deletion did not finish. Retry with your password. Cloud writes may be paused until deletion completes.');
    }
  } catch {
    failure = new Error('The deletion response could not be confirmed. Do not assume the account was kept or deleted. Retry; contact private support if sign-in is no longer possible.');
  }
  if (failure) {
    // The server may have finished even though its final response never arrived.
    // The receipt — not a sign-in attempt — is the only acceptable proof.
    const status = await queryDeletionReceipt(receipt);
    if (!(status?.state === 'completed' && status.userId === userId)) throw failure;
  }
  purge.confirmed = true;
  // Persist the recovery ledger before clearing records. A failed cleanup never masquerades as success.
  let pending = false;
  try { await AsyncStorage.setItem(key,JSON.stringify(purge)); await finishPurge(key,purge); }
  catch { pending = true; }
  return { localCleanupPending:pending };
}
