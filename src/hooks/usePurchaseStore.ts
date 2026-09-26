import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { demoPurchases } from '../data/demoPurchases';
import { deletePurchase, listPurchases, savePurchase } from '../lib/purchaseRepository';
import { LocalPurchaseStore, mergeCloud, readSnapshot, removeItem, replaceItems, snapshotFor, storageKeyFor, upsertItem, type Snapshot } from '../lib/localPurchaseStore';
import type { Purchase } from '../types/purchase';

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';

export function usePurchaseStore(userId?: string | null) {
  const [items, setItems] = useState<Purchase[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const engine = useRef<LocalPurchaseStore | null>(null);
  const syncRunning = useRef<LocalPurchaseStore | null>(null);
  const account = useRef(userId); account.current = userId;

  useEffect(() => {
    let cancelled = false;
    const key = storageKeyFor(userId);
    const store = new LocalPurchaseStore(snapshot => AsyncStorage.setItem(key, JSON.stringify(snapshot)));
    engine.current = null; setHydrated(false); setItems([]); setStorageError(null); setSyncError(null);
    setSyncStatus(userId ? 'syncing' : 'local');
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        store.snapshot = raw ? readSnapshot(raw) : snapshotFor(userId ? [] : demoPurchases);
        if (!cancelled) { engine.current = store; setItems(store.snapshot.items); setHydrated(true); }
      } catch {
        if (!cancelled) { setStorageError('Saved records could not be read. Reload to retry. Existing storage has not been overwritten.'); setHydrated(true); }
      }
    })();
    return () => { cancelled = true; engine.current = null; };
  }, [userId]);

  const publish = useCallback(async (store: LocalPurchaseStore, change: (s: Snapshot) => Snapshot) => {
    try {
      const snapshot = await store.mutate(change);
      if (engine.current === store) { setItems(snapshot.items); setStorageError(null); }
    } catch (error) {
      if (engine.current === store) setStorageError('Could not save on this device. Your previous records are unchanged. Free some storage and retry.');
      throw error;
    }
  }, []);

  const retrySync = useCallback(async () => {
    const store = engine.current;
    const owner = userId;
    if (!store || !owner || syncRunning.current === store) return;
    syncRunning.current = store; setSyncStatus('syncing'); setSyncError(null);
    const current = () => engine.current === store && account.current === owner;
    try {
      // Process durable tombstones first. Network failure leaves the outbox intact.
      while (current() && (store.snapshot.deleted.length || store.snapshot.pending.length)) {
        const id = store.snapshot.deleted[0];
        if (id !== undefined) {
          await deletePurchase(id);
          if (!current()) return;
          await publish(store, s => ({ ...s, deleted: s.deleted.filter(value => value !== id) }));
        } else {
          const pendingId = store.snapshot.pending[0];
          const purchase = store.snapshot.items.find(item => item.id === pendingId);
          if (purchase) await savePurchase(purchase);
          if (!current()) return;
          await publish(store, s => ({ ...s, pending: s.items.find(item => item.id === pendingId) === purchase ? s.pending.filter(value => value !== pendingId) : s.pending }));
        }
      }
      if (!current()) return;
      const cloud = await listPurchases();
      if (!current()) return;
      await publish(store, s => mergeCloud(s, cloud));
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

  const change = useCallback(async (operation: (s: Snapshot) => Snapshot) => {
    const store = engine.current;
    if (!store) throw new Error('Storage is not ready. Reload and retry.');
    setSaving(true);
    try { await publish(store, operation); }
    finally { setSaving(false); }
    void retrySync();
  }, [publish, retrySync]);
  const signedIn = Boolean(userId);
  const upsert = useCallback((purchase: Purchase) => change(s => upsertItem(s, purchase, signedIn)), [change, signedIn]);
  const remove = useCallback((id: Purchase['id']) => change(s => removeItem(s, id, signedIn)), [change, signedIn]);
  const replaceAll = useCallback((next: Purchase[]) => change(s => replaceItems(s, next, signedIn)), [change, signedIn]);
  const restoreSamples = useCallback(() => change(s => upsertEach(s, demoPurchases.filter(demo => !s.items.some(item => item.id === demo.id)), signedIn)), [change, signedIn]);
  return { items, hydrated, saving, storageError, syncStatus, syncError, online, upsert, remove, replaceAll, restoreSamples, retrySync };
}

/** Appends missing sample records without touching existing ones or queueing unchanged rows. */
function upsertEach(snapshot: Snapshot, additions: Purchase[], signedIn: boolean): Snapshot {
  return additions.reduce<Snapshot>((current, purchase) => upsertItem(current, purchase, signedIn), snapshot);
}
