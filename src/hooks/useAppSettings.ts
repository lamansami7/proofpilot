import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { withStorageLock } from '../lib/storageTransaction';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'proofpilot.v1.settings';
export type AppSettings = {
  defaultReturnWindowDays: number;
  sampleBannerDismissed: boolean;
  onboardingCompleted: boolean;
};
const defaults: AppSettings = {
  defaultReturnWindowDays: 30,
  sampleBannerDismissed: false,
  onboardingCompleted: false,
};
export function validateSettings(value: unknown): AppSettings {
  const input = value && typeof value === 'object' ? (value as Partial<AppSettings>) : {};
  return {
    defaultReturnWindowDays:
      Number.isInteger(input.defaultReturnWindowDays) &&
      input.defaultReturnWindowDays! >= 1 &&
      input.defaultReturnWindowDays! <= 365
        ? input.defaultReturnWindowDays!
        : 30,
    sampleBannerDismissed: input.sampleBannerDismissed === true,
    onboardingCompleted: input.onboardingCompleted === true,
  };
}
/** Read/merge/write settings under the same cross-tab lock used for purchases. */
async function readSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return defaults;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Unreadable settings.');
  return validateSettings(parsed);
}
export function useAppSettings() {
  const [settings, setSettings] = useState(defaults);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    active.current = true;
    const refresh = () => {
      const operation = queue.current.then(() => withStorageLock(STORAGE_KEY, async () => {
        const next = await readSettings();
        if (active.current) { setSettings(next); setError(null); }
      })).catch(() => {
        if (active.current) setError('Settings could not be read. Defaults or the last saved settings are shown; nothing has been overwritten.');
      }).finally(() => { if (active.current) setHydrated(true); });
      queue.current = operation;
    };
    refresh();
    const updated = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) refresh(); };
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('storage', updated);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => {
      active.current = false;
      subscription.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('storage', updated);
    };
  }, []);
  const update = useCallback((patch: Partial<AppSettings>): Promise<void> => {
    const operation = queue.current.then(() => withStorageLock(STORAGE_KEY, async () => {
      // Never overwrite a corrupt cache or merge against a stale tab's defaults.
      const next = validateSettings({ ...await readSettings(), ...patch });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      if (active.current) { setSettings(next); setError(null); }
    })).catch(() => {
      if (active.current) setError('Settings were not saved. Existing settings have not been overwritten. Check device storage and retry.');
      throw new Error('Settings were not saved.');
    });
    queue.current = operation.catch(() => undefined);
    return operation;
  }, []);
  return { settings, hydrated, error, update };
}
