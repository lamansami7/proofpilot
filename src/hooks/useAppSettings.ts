import { useCallback, useEffect, useRef, useState } from 'react';
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
export function useAppSettings() {
  const [settings, setSettings] = useState(defaults);
  const current = useRef(defaults);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    queue.current = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const next = raw ? validateSettings(JSON.parse(raw)) : defaults;
        if (!cancelled) {
          current.current = next;
          setSettings(next);
        }
      } catch {
        if (!cancelled)
          setError('Settings could not be read. Defaults are shown; nothing has been overwritten.');
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const update = useCallback(
    (patch: Partial<AppSettings>): Promise<void> => {
      const operation = queue.current.then(async () => {
        const next = validateSettings({ ...current.current, ...patch });
        try {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          current.current = next;
          setSettings(next);
          setError(null);
        } catch {
          setError('Settings were not saved. Free device storage and try again.');
          throw new Error('Settings were not saved.');
        }
      });
      queue.current = operation.catch(() => undefined);
      return operation;
    },
    [],
  );
  return { settings, hydrated, error, update };
}
