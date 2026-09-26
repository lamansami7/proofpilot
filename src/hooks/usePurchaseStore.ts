import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { demoPurchases } from '../data/demoPurchases';
import { deletePurchase, listPurchases, savePurchase } from '../lib/purchaseRepository';
import { LocalPurchaseStore, mergeCloud, readSnapshot, snapshotFor, type Snapshot } from '../lib/localPurchaseStore';
import type { Purchase } from '../types/purchase';

export const PURCHASE_STORAGE_KEY = 'proofpilot.v1.purchases';
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';
export type PurchaseStore = ReturnType<typeof usePurchaseStore>;

export function usePurchaseStore(userId?: string | null) {
  const [items, setItems] = useState<Purchase[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [syncError, setSyncError] = useState<string | null>(null);
  const engine = useRef<LocalPurchaseStore | null>(null);
  const syncRunning = useRef<LocalPurchaseStore | null>(null);
  const account = useRef(userId); account.current = userId;

  useEffect(() => {
    let cancelled = false;
    const key = userId ? `${PURCHASE_STORAGE_KEY}.account.${userId}` : PURCHASE_STORAGE_KEY;
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
    const online = () => { void retrySync(); };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [retrySync]);

  const change = useCallback(async (operation: (s: Snapshot) => Snapshot) => {
    const store = engine.current;
    if (!store) throw new Error('Storage is not ready. Reload and retry.');
    setSaving(true);
    try { await publish(store, operation); }
    finally { setSaving(false); }
    void retrySync();
  }, [publish, retrySync]);
  const upsert = useCallback((purchase: Purchase) => change(s => ({ ...s,
    items: s.items.some(item => item.id === purchase.id) ? s.items.map(item => item.id === purchase.id ? purchase : item) : [purchase, ...s.items],
    pending: userId ? [...new Set([...s.pending, purchase.id])] : s.pending,
    deleted: s.deleted.filter(id => id !== purchase.id),
  })), [change, userId]);
  const remove = useCallback((id: Purchase['id']) => change(s => ({ ...s, items: s.items.filter(item => item.id !== id), pending: s.pending.filter(value => value !== id), deleted: userId ? [...new Set([...s.deleted, id])] : [] })), [change, userId]);
  const replaceAll = useCallback((next: Purchase[]) => change(s => ({ version: 2, items: next, pending: userId ? next.map(item => item.id) : [], deleted: userId ? [...new Set([...s.deleted, ...s.items.filter(item => !next.some(n => n.id === item.id)).map(item => item.id)])] : [] })), [change, userId]);
  const restoreSamples = useCallback(() => change(s => ({ ...s, items: [...s.items, ...demoPurchases.filter(demo => !s.items.some(item => item.id === demo.id))] })), [change]);
  return { items, hydrated, saving, storageError, syncStatus, syncError, upsert, remove, replaceAll, restoreSamples, retrySync };
}
