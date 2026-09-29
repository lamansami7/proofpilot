import { MAX_SYNC_ATTEMPTS, MAX_SYNC_RETRY_MS, canRetrySync, isRetryableSyncError, syncRetryDelay } from '../syncBackoff';

describe('bounded sync backoff', () => {
  test('retries transient failures but not permanent ones', () => {
    expect(isRetryableSyncError(new Error('TypeError: Failed to fetch'))).toBe(true);
    expect(isRetryableSyncError(new Error('Network request failed'))).toBe(true);
    expect(isRetryableSyncError(new Error('timeout of 25000ms exceeded'))).toBe(true);
    expect(isRetryableSyncError(new Error('socket hang up'))).toBe(true);
    expect(isRetryableSyncError(new Error('HTTP 429 rate limit'))).toBe(true);
    // Retrying these cannot help and would waste quota.
    expect(isRetryableSyncError(new Error('JWT expired'))).toBe(false);
    expect(isRetryableSyncError(new Error('new row violates row-level security policy'))).toBe(false);
    expect(isRetryableSyncError(new Error('Supabase is not configured.'))).toBe(false);
    expect(isRetryableSyncError(new Error('The account changed. Retry sync after signing in.'))).toBe(false);
    expect(isRetryableSyncError(new Error('This record was deleted. Refresh before saving'))).toBe(false);
  });

  test('grows exponentially, applies jitter, and never exceeds the cap', () => {
    expect(syncRetryDelay(1, { baseMs: 1000, random: () => 1 })).toBe(1000);
    expect(syncRetryDelay(1, { baseMs: 1000, random: () => 0 })).toBe(500);
    expect(syncRetryDelay(2, { baseMs: 1000, random: () => 1 })).toBe(2000);
    expect(syncRetryDelay(3, { baseMs: 1000, random: () => 1 })).toBe(4000);
    // Equal jitter keeps the result inside [delay/2, delay] so many clients desynchronise.
    for (const attempt of [1, 2, 5, 9]) {
      const value = syncRetryDelay(attempt, { baseMs: 1000, maxMs: MAX_SYNC_RETRY_MS, random: () => 0.5 });
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(MAX_SYNC_RETRY_MS);
    }
    expect(syncRetryDelay(50, { baseMs: 1000, maxMs: MAX_SYNC_RETRY_MS, random: () => 1 })).toBe(MAX_SYNC_RETRY_MS);
  });

  test('a nonsense attempt number cannot produce a negative or infinite delay', () => {
    for (const attempt of [0, -5, NaN, Infinity]) {
      const value = syncRetryDelay(attempt, { baseMs: 1000 });
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  test('the retry budget is finite, so sync can never loop forever', () => {
    let attempts = 0;
    while (canRetrySync(attempts)) attempts++;
    expect(attempts).toBe(MAX_SYNC_ATTEMPTS - 1);
    expect(attempts).toBeLessThan(10);
    expect(canRetrySync(0)).toBe(true);
    expect(canRetrySync(MAX_SYNC_ATTEMPTS)).toBe(false);
  });
});
