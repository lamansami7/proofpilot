import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { demoPurchases } from '../data/demoPurchases';
import type { Purchase } from '../types/purchase';

const STORAGE_KEY = 'proofpilot.v1.purchases';

export type PurchaseStore = {
  items: Purchase[];
  hydrated: boolean;
  storageError: boolean;
  upsert: (purchase: Purchase) => void;
  remove: (id: Purchase['id']) => void;
  replaceAll: (items: Purchase[]) => void;
  restoreSamples: () => void;
};

/**
 * Local-first purchase store. Data is persisted on the device (AsyncStorage).
 * The first launch is seeded with clearly-labelled sample purchases so the
 * product is understandable immediately; every change afterwards is saved.
 */
export function usePurchaseStore(): PurchaseStore {
  const [items, setItems] = useState<Purchase[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw);
          setItems(Array.isArray(parsed) ? (parsed as Purchase[]) : demoPurchases);
        } else {
          setItems(demoPurchases);
        }
      } catch {
        if (!cancelled) { setItems(demoPurchases); setStorageError(true); }
      } finally {
        if (!cancelled) { hydratedRef.current = true; setHydrated(true); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => setStorageError(true));
  }, [items]);

  const upsert = useCallback((purchase: Purchase) => {
    setItems((current) => current.some((item) => item.id === purchase.id) ? current.map((item) => (item.id === purchase.id ? purchase : item)) : [purchase, ...current]);
  }, []);
  const remove = useCallback((id: Purchase['id']) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  const replaceAll = useCallback((next: Purchase[]) => setItems(next), []);
  const restoreSamples = useCallback(() => setItems(demoPurchases), []);

  return { items, hydrated, storageError, upsert, remove, replaceAll, restoreSamples };
}
