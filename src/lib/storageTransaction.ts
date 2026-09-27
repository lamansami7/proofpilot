import { Platform } from 'react-native';
/** Web Locks coordinate same-origin tabs. No unsafe unlocked write fallback. */
export async function withStorageLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  if (Platform.OS !== 'web') return operation();
  if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('Safe browser storage requires HTTPS and Web Locks support.');
  return navigator.locks.request(key, { mode: 'exclusive' }, operation);
}
