import NetInfo from '@react-native-community/netinfo';
import { withStorageLock } from '../lib/storageTransaction';
import { AppState, Platform } from 'react-native';
import { MAX_SYNC_ROUNDS, canRetrySync, isRetryableSyncError, syncRetryDelay } from '../lib/syncBackoff';
import { removeUnreferencedFile } from '../lib/fileMaintenance';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clientForAccount } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { demoPurchases } from '../data/demoPurchases';
import { deletePurchase, listPurchases, listDeletedPurchases, savePurchase } from '../lib/purchaseRepository';
import { PurchaseConflictError, LocalPurchaseStore, applyRemoteDeletions, mergeCloud, readSnapshot, removeItem, removeItems, replaceItems, snapshotFor, storageKeyFor, upsertItem, type Snapshot } from '../lib/localPurchaseStore';
import type { Purchase } from '../types/purchase';

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';

export function usePurchaseStore(userId?: string | null, enabled = true) {
  const [generation, setGeneration] = useState(0);
  const [items, setItems] = useState<Purchase[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const cleanupRunning = useRef<LocalPurchaseStore | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [syncError, setSyncError] = useState<string | null>(null);
  // Local-first honesty: the exact number of changes still waiting to reach the
  // server, so the UI can say "3 changes saved on this device" rather than a
  // vague "local only".
  const [pendingChanges, setPendingChanges] = useState(0);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const engine = useRef<LocalPurchaseStore | null>(null);
  const syncRunning = useRef<LocalPurchaseStore | null>(null);
  const syncAttempt = useRef(0);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const account = useRef(userId); account.current = userId;
  // A pending backoff must never outlive the account or the component.
  const cancelScheduledSync = useCallback(() => {
    if (syncTimer.current !== null) { clearTimeout(syncTimer.current); syncTimer.current = null; }
  }, []);

  useEffect(() => {
    if (!enabled) { engine.current = null; setItems([]); setHydrated(false); setPendingChanges(0); return; }
    let cancelled = false;
    cancelScheduledSync(); syncAttempt.current = 0;
    const key = storageKeyFor(userId);
    const store = new LocalPurchaseStore(snapshot => AsyncStorage.setItem(key, JSON.stringify(snapshot)), async () => readSnapshot(await AsyncStorage.getItem(key)), operation => withStorageLock(key, operation));
    engine.current = null; setHydrated(false); setItems([]); setStorageError(null); setSyncError(null); setPendingChanges(0);
    setSyncStatus(userId ? 'syncing' : 'local');
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        store.snapshot = raw ? readSnapshot(raw) : snapshotFor();
        if (!cancelled) { engine.current = store; setItems(store.snapshot.items); setPendingChanges(store.snapshot.pending.length + store.snapshot.deleted.length); setHydrated(true); }
      } catch {
        if (!cancelled) { setStorageError('Saved records could not be read. Reload to retry. Existing storage has not been overwritten.'); setHydrated(true); }
      }
    })();
    return () => { cancelled = true; cancelScheduledSync(); engine.current = null; };
  }, [userId, generation, enabled, cancelScheduledSync]);

  const retryCleanup = useCallback(async () => {
    const store = engine.current;
    if (!store || cleanupRunning.current === store) return;
    cleanupRunning.current = store; setCleanupError(null);
    try {
      while (engine.current === store && store.snapshot.cleanup?.length) {
        const uri = store.snapshot.cleanup[0];
        await removeUnreferencedFile(uri);
        await store.mutate(s => ({ ...s, cleanup: s.cleanup?.filter(value => value !== uri) }));
      }
    } catch {
      if (engine.current === store) setCleanupError('Records were saved, but unused file cleanup needs a retry. Originals are unaffected.');
    } finally { if (cleanupRunning.current === store) cleanupRunning.current = null; }
  }, []);
  useEffect(() => { if (hydrated) void retryCleanup(); }, [hydrated, retryCleanup]);

  const publish = useCallback(async (store: LocalPurchaseStore, change: (s: Snapshot) => Snapshot) => {
    try {
      const snapshot = await store.mutate(change);
      if (engine.current === store) { setItems(snapshot.items); setPendingChanges(snapshot.pending.length + snapshot.deleted.length); setStorageError(null); void retryCleanup(); }
    } catch (error) {
      if (engine.current === store) setStorageError(error instanceof PurchaseConflictError ? error.message : 'Could not save on this device. Your previous records are unchanged. Check device storage and retry.');
      throw error;
    }
  }, [retryCleanup]);

  const retrySync = useCallback(async () => {
    const store = engine.current;
    const owner = userId;
    if (!store || !owner || syncRunning.current === store) return;
    // A fresh trigger (manual retry, reconnect, new edit) supersedes any pending backoff.
    cancelScheduledSync();
    syncRunning.current = store; setSyncStatus('syncing'); setSyncError(null);
    const current = () => engine.current === store && account.current === owner;
    const outboxPending = () => store.snapshot.pending.length > 0 || store.snapshot.deleted.length > 0;
    try {
      const client = await clientForAccount(owner);
      // One round drains the outbox, then merges the cloud. A local edit made while
      // the round was in flight re-queues work, so run a bounded number of extra
      // rounds instead of stranding that edit until the next trigger. The bound keeps
      // a constantly-editing device from spinning forever.
      for (let round = 0; round < MAX_SYNC_ROUNDS && current(); round++) {
        // Fetch permanent server tombstones before uploads: deletion wins over stale offline edits.
        const deleted = await listDeletedPurchases(client);
        if (!current()) return;
        await publish(store, s => applyRemoteDeletions(s, deleted));
        // Process durable tombstones first. Network failure leaves the outbox intact.
        while (current() && (store.snapshot.deleted.length || store.snapshot.pending.length)) {
          const id = store.snapshot.deleted[0];
          if (id !== undefined) {
            await deletePurchase(id, client);
            if (!current()) return;
            await publish(store, s => ({ ...s, deleted: s.deleted.filter(value => value !== id) }));
          } else {
            const pendingId = store.snapshot.pending[0];
            const purchase = store.snapshot.items.find(item => item.id === pendingId);
            if (purchase) await savePurchase(purchase, client);
            if (!current()) return;
            await publish(store, s => ({ ...s, pending: JSON.stringify(s.items.find(item => item.id === pendingId)) === JSON.stringify(purchase) ? s.pending.filter(value => value !== pendingId) : s.pending }));
          }
        }
        if (!current()) return;
        const cloud = await listPurchases(client);
        if (!current()) return;
        const remoteDeleted = await listDeletedPurchases(client);
        if (!current()) return;
        await publish(store, s => applyRemoteDeletions(mergeCloud(s, cloud), remoteDeleted));
        if (!outboxPending()) break;
      }
      if (!current()) return;
      syncAttempt.current = 0;
      setSyncStatus(outboxPending() ? 'error' : 'synced');
    } catch (error) {
      if (current()) {
        // Bounded backoff: only transient failures are retried, and only while budget remains.
        if (isRetryableSyncError(error) && canRetrySync(syncAttempt.current)) {
          syncAttempt.current += 1;
          setSyncStatus('syncing');
          syncTimer.current = setTimeout(() => { syncTimer.current = null; void retrySync(); }, syncRetryDelay(syncAttempt.current));
        } else {
          syncAttempt.current = 0;
          setSyncStatus('error');
          setSyncError('Cloud sync did not finish. Device records and pending changes are retained. Check your connection and database migration, then retry.');
        }
      }
    } finally { if (syncRunning.current === store) syncRunning.current = null; }
  }, [userId, publish, cancelScheduledSync]);

  useEffect(() => { if (hydrated) void retrySync(); }, [hydrated, retrySync]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onlineEvent = () => { setOnline(true); void retrySync(); };
    const offlineEvent = () => setOnline(false);
    window.addEventListener('online', onlineEvent);
    window.addEventListener('offline', offlineEvent);
    return () => { window.removeEventListener('online', onlineEvent); window.removeEventListener('offline', offlineEvent); };
  }, [retrySync]);

  useEffect(() => {
    const refresh = () => {
      const store = engine.current;
      if (store) void publish(store, s => s).then(() => retrySync()).catch(() => undefined);
    };
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const updated = (event: StorageEvent) => { if (event.key === storageKeyFor(userId) || event.key === null) refresh(); };
    // Do not write back a storage event: equal serialized snapshots generate no new browser event.
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('storage', updated);
    return () => { subscription.remove(); if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('storage', updated); };
  }, [publish, retrySync, userId]);

  useEffect(() => NetInfo.addEventListener(state => {
    const connected = state.isConnected !== false && state.isInternetReachable !== false;
    setOnline(connected);
    if (connected) void retrySync();
  }), [retrySync]);

  const change = useCallback(async (operation: (s: Snapshot) => Snapshot) => {
    const store = engine.current;
    if (!store || account.current !== userId) throw new Error('The account changed or storage is not ready. Reload and retry.');
    setSaving(true);
    try { await publish(store, operation); }
    finally { setSaving(false); }
    void retrySync();
  }, [publish, retrySync, userId]);
  const signedIn = Boolean(userId);
  const upsert = useCallback((purchase: Purchase, mustExist = false, expected?: Purchase) => change(s => {
    if (mustExist && !s.items.some(item => item.id === purchase.id)) throw new PurchaseConflictError('This purchase was removed in another window. Refresh before editing.');
    return upsertItem(s, purchase, signedIn, expected);
  }), [change, signedIn]);
  const remove = useCallback((id: Purchase['id']) => change(s => removeItem(s, id, signedIn)), [change, signedIn]);
  const removeMany = useCallback((ids: Purchase['id'][]) => change(s => removeItems(s, ids, signedIn)), [change, signedIn]);
  const replaceAll = useCallback((next: Purchase[]) => change(s => replaceItems(s, next, signedIn)), [change, signedIn]);
  const restoreBackup = useCallback((records: Purchase[]) => change(s => upsertEach(s, records, signedIn)), [change, signedIn]);
  const restoreSamples = useCallback(() => change(s => upsertEach(s, (__DEV__ ? demoPurchases : []).filter(demo => !s.items.some(item => item.id === demo.id)), signedIn)), [change, signedIn]);
  const suspend = async () => { cancelScheduledSync(); syncAttempt.current = 0; const store = engine.current; engine.current = null; if (store) await store.drain(); };
  const reload = () => setGeneration(value => value + 1);
  return { suspend, reload, items, hydrated, saving, storageError, cleanupError, retryCleanup, syncStatus, syncError, online, pendingChanges, upsert, remove, removeMany, replaceAll, restoreSamples, restoreBackup, retrySync };
}

/** Appends missing sample records without touching existing ones or queueing unchanged rows. */
function upsertEach(snapshot: Snapshot, additions: Purchase[], signedIn: boolean): Snapshot {
  return additions.reduce<Snapshot>((current, purchase) => upsertItem(current, purchase, signedIn), snapshot);
}
