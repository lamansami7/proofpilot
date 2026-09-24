import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'proofpilot.v1.settings';

export type AppSettings = {
  /** Suggested return window (in days) offered when adding a purchase. */
  defaultReturnWindowDays: number;
  /** Whether the "sample data" banner on the dashboard has been dismissed. */
  sampleBannerDismissed: boolean;
};

const defaults: AppSettings = { defaultReturnWindowDays: 30, sampleBannerDismissed: false };

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && raw) setSettings({ ...defaults, ...(JSON.parse(raw) as Partial<AppSettings>) });
      } catch { /* fall back to defaults */ } finally {
        if (!cancelled) { hydratedRef.current = true; setHydrated(true); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => undefined);
  }, [settings]);

  const update = useCallback((patch: Partial<AppSettings>) => setSettings((current) => ({ ...current, ...patch })), []);
  return { settings, hydrated, update };
}
