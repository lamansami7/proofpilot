import NetInfo from '@react-native-community/netinfo';
import { withStorageLock } from '../lib/storageTransaction';
import { AppState } from 'react-native';
import { removeUnreferencedFile } from '../lib/fileMaintenance';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clientForAccount } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { demoPurchases } from '../data/demoPurchases';
import { deletePurchase, listPurchases, listDeletedPurchases, savePurchase } from '../lib/purchaseRepository';
import { LocalPurchaseStore, applyRemoteDeletions, mergeCloud, readSnapshot, removeItem, replaceItems, snapshotFor, storageKeyFor, upsertItem, type Snapshot } from '../lib/localPurchaseStore';
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
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const engine = useRef<LocalPurchaseStore | null>(null);
  const syncRunning = useRef<LocalPurchaseStore | null>(null);
  const account = useRef(userId); account.current = userId;

  useEffect(() => {
    if (!enabled) { engine.current = null; setItems([]); setHydrated(false); return; }
    let cancelled = false;
    const key = storageKeyFor(userId);
    const store = new LocalPurchaseStore(snapshot => AsyncStorage.setItem(key, JSON.stringify(snapshot)), async () => readSnapshot(await AsyncStorage.getItem(key)), operation => withStorageLock(key, operation));
    engine.current = null; setHydrated(false); setItems([]); setStorageError(null); setSyncError(null);
    setSyncStatus(userId ? 'syncing' : 'local');
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        store.snapshot = raw ? readSnapshot(raw) : snapshotFor();
        if (!cancelled) { engine.current = store; setItems(store.snapshot.items); setHydrated(true); }
      } catch {
        if (!cancelled) { setStorageError('Saved records could not be read. Reload to retry. Existing storage has not been overwritten.'); setHydrated(true); }
      }
    })();
    return () => { cancelled = true; engine.current = null; };
  }, [userId, generation, enabled]);

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
      if (engine.current === store) { setItems(snapshot.items); setStorageError(null); void retryCleanup(); }
    } catch (error) {
      if (engine.current === store) setStorageError('Could not save on this device. Your previous records are unchanged. Free some storage and retry.');
      throw error;
    }
  }, [retryCleanup]);

  const retrySync = useCallback(async () => {
    const store = engine.current;
    const owner = userId;
    if (!store || !owner || syncRunning.current === store) return;
    syncRunning.current = store; setSyncStatus('syncing'); setSyncError(null);
    const current = () => engine.current === store && account.current === owner;
    try {
      // Fetch permanent server tombstones before uploads: deletion wins over stale offline edits.
      const client = await clientForAccount(owner);
      if (!current()) return;
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
      if (current()) setSyncStatus(store.snapshot.pending.length || store.snapshot.deleted.length ? 'error' : 'synced');
    } catch {
      if (current()) { setSyncStatus('error'); setSyncError('Cloud sync did not finish. Device records and pending changes are retained. Check your connection and database migration, then retry.'); }
    } finally { if (syncRunning.current === store) syncRunning.current = null; }
  }, [userId, publish]);

  useEffect(() => { if (hydrated) void retrySync(); }, [hydrated, retrySync]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
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
    const updated = (event: StorageEvent) => { if (event.key === storageKeyFor(userId)) refresh(); };
    // Do not write back a storage event: equal serialized snapshots generate no new browser event.
    if (typeof window !== 'undefined') window.addEventListener('storage', updated);
    return () => { subscription.remove(); if (typeof window !== 'undefined') window.removeEventListener('storage', updated); };
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
  const upsert = useCallback((purchase: Purchase) => change(s => upsertItem(s, purchase, signedIn)), [change, signedIn]);
  const remove = useCallback((id: Purchase['id']) => change(s => removeItem(s, id, signedIn)), [change, signedIn]);
  const replaceAll = useCallback((next: Purchase[]) => change(s => replaceItems(s, next, signedIn)), [change, signedIn]);
  const restoreBackup = useCallback((records: Purchase[]) => change(s => upsertEach(s, records, signedIn)), [change, signedIn]);
  const restoreSamples = useCallback(() => change(s => upsertEach(s, (__DEV__ ? demoPurchases : []).filter(demo => !s.items.some(item => item.id === demo.id)), signedIn)), [change, signedIn]);
  const suspend = async () => { const store = engine.current; engine.current = null; if (store) await store.drain(); };
  const reload = () => setGeneration(value => value + 1);
  return { suspend, reload, items, hydrated, saving, storageError, cleanupError, retryCleanup, syncStatus, syncError, online, upsert, remove, replaceAll, restoreSamples, restoreBackup, retrySync };
}

/** Appends missing sample records without touching existing ones or queueing unchanged rows. */
function upsertEach(snapshot: Snapshot, additions: Purchase[], signedIn: boolean): Snapshot {
  return additions.reduce<Snapshot>((current, purchase) => upsertItem(current, purchase, signedIn), snapshot);
}
