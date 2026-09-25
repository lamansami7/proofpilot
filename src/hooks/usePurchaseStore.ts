import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { demoPurchases } from '../data/demoPurchases';
import { migratePurchases } from '../lib/purchaseMigration';
import { deletePurchase as deleteCloudPurchase, listPurchases, savePurchase as saveCloudPurchase } from '../lib/purchaseRepository';
import type { Purchase } from '../types/purchase';

export const PURCHASE_STORAGE_KEY = 'proofpilot.v1.purchases';
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';
export type PurchaseStore = { items: Purchase[]; hydrated: boolean; saving: boolean; storageError: string | null; syncStatus: SyncStatus; syncError: string | null; upsert: (purchase: Purchase) => Promise<void>; remove: (id: Purchase['id']) => Promise<void>; replaceAll: (items: Purchase[]) => Promise<void>; restoreSamples: () => Promise<void> };

export function usePurchaseStore(userId?: string | null): PurchaseStore {
  const [items, setItems] = useState<Purchase[]>([]);
  const itemsRef = useRef<Purchase[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(userId ? 'syncing' : 'local');
  const [syncError, setSyncError] = useState<string | null>(null);
  const queue = useRef(Promise.resolve());

  useEffect(() => { let cancelled = false; (async () => {
    try {
      const raw = await AsyncStorage.getItem(PURCHASE_STORAGE_KEY);
      const migrated = raw ? migratePurchases(JSON.parse(raw)) : demoPurchases;
      if (!cancelled) { itemsRef.current = migrated; setItems(migrated); }
    } catch { if (!cancelled) { itemsRef.current = demoPurchases; setItems(demoPurchases); setStorageError('Device storage could not be read.'); } }
    finally { if (!cancelled) setHydrated(true); }
  })(); return () => { cancelled = true; }; }, []);

  const persist = useCallback(async (next: Purchase[]) => {
    setSaving(true); setStorageError(null);
    const operation = queue.current.then(() => AsyncStorage.setItem(PURCHASE_STORAGE_KEY, JSON.stringify(next)));
    queue.current = operation.catch(() => undefined);
    try { await operation; itemsRef.current = next; setItems(next); }
    catch { setStorageError('Your change could not be saved on this device.'); throw new Error('Your change could not be saved on this device.'); }
    finally { setSaving(false); }
  }, []);
  useEffect(() => {
    if (!hydrated || !userId) { if (!userId) setSyncStatus('local'); return; }
    let cancelled = false; setSyncStatus('syncing'); setSyncError(null);
    listPurchases().then(async (cloud) => {
      if (cancelled) return;
      if (cloud.length) await persist(cloud);
      if (!cancelled) setSyncStatus('synced');
    }).catch(() => { if (!cancelled) { setSyncStatus('error'); setSyncError('Cloud could not be reached. Your local records remain available.'); } });
    return () => { cancelled = true; };
  }, [hydrated, userId, persist]);

  const upsert = useCallback(async (purchase: Purchase) => {
    const previousId = purchase.id;
    await persist(itemsRef.current.some((item) => item.id === previousId) ? itemsRef.current.map((item) => item.id === previousId ? purchase : item) : [purchase, ...itemsRef.current]);
    if (!userId) return;
    setSyncStatus('syncing'); setSyncError(null);
    try { const cloud = await saveCloudPurchase(purchase); await persist(itemsRef.current.map((item) => item.id === previousId ? cloud : item)); setSyncStatus('synced'); }
    catch { setSyncStatus('error'); setSyncError('Saved locally, but cloud sync is waiting for a connection.'); }
  }, [persist, userId]);
  const remove = useCallback(async (id: Purchase['id']) => { await persist(itemsRef.current.filter((item) => item.id !== id)); if (userId) { try { await deleteCloudPurchase(id); setSyncStatus('synced'); } catch { setSyncStatus('error'); setSyncError('Deleted locally; cloud deletion will need to be retried.'); } } }, [persist, userId]);
  const replaceAll = useCallback((next: Purchase[]) => persist(next), [persist]);
  const restoreSamples = useCallback(() => persist(demoPurchases), [persist]);
  return { items, hydrated, saving, storageError, syncStatus, syncError, upsert, remove, replaceAll, restoreSamples };
}
