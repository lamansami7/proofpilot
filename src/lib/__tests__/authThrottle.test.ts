import {
  AUTH_ATTEMPT_LIMIT,
  AUTH_ATTEMPT_WINDOW_MS,
  authThrottleMessage,
  createAuthThrottle,
  isRateLimitedError,
} from '../authThrottle';
import { MAX_SESSION_RESTORE_TIMEOUT_MS, SESSION_RESTORE_TIMEOUT_MS, resolveSessionRestoreTimeout } from '../sessionRestore';

describe('client-side auth throttle', () => {
  test('allows the full ordinary retry budget before imposing any wait', () => {
    const throttle = createAuthThrottle();
    // remaining() answers "may I attempt now?", so the last permitted attempt still reports 0.
    for (let attempt = 1; attempt < AUTH_ATTEMPT_LIMIT; attempt++) expect(throttle.record(1000)).toBe(0);
    expect(throttle.record(1000)).toBe(AUTH_ATTEMPT_WINDOW_MS);
    expect(throttle.remaining(1000)).toBe(AUTH_ATTEMPT_WINDOW_MS);
  });

  test('blocks once the bounded attempt budget is spent and releases when the window rolls', () => {
    const throttle = createAuthThrottle({ limit: 3, windowMs: 60_000 });
    throttle.record(0); throttle.record(0); expect(throttle.record(0)).toBe(60_000);
    expect(throttle.remaining(0)).toBe(60_000);
    expect(throttle.remaining(59_999)).toBe(1);
    // Oldest attempt ages out, freeing a slot without any explicit reset.
    expect(throttle.remaining(60_000)).toBe(0);
  });

  test('a provider rate-limit response imposes a cooldown that never shrinks', () => {
    const throttle = createAuthThrottle({ cooldownMs: 30_000 });
    throttle.penalize(0);
    expect(throttle.remaining(1_000)).toBe(29_000);
    // A repeated report from the same instant must not shorten the wait.
    throttle.penalize(0);
    expect(throttle.remaining(1_000)).toBe(29_000);
    expect(throttle.remaining(30_000)).toBe(0);
  });

  test('a successful sign-in clears the window', () => {
    const throttle = createAuthThrottle({ limit: 2, windowMs: 60_000 });
    throttle.record(0); throttle.penalize(0);
    throttle.reset();
    expect(throttle.remaining(0)).toBe(0);
  });

  test('no throttle state is written to disk', () => {
    // The throttle is a closure over an array; it must expose no persistence API.
    expect(Object.keys(createAuthThrottle()).sort()).toEqual(['penalize', 'record', 'remaining', 'reset']);
  });

  test('recognises provider rate limiting without treating bad input as throttling', () => {
    expect(isRateLimitedError('Rate limit exceeded')).toBe(true);
    expect(isRateLimitedError('Too many requests')).toBe(true);
    expect(isRateLimitedError('HTTP 429')).toBe(true);
    expect(isRateLimitedError('Invalid login credentials')).toBe(false);
    expect(isRateLimitedError('Email not confirmed')).toBe(false);
  });

  test('the wait message names a duration and never echoes input', () => {
    expect(authThrottleMessage(1)).toBe('Too many attempts. Wait 1 second before trying again.');
    expect(authThrottleMessage(4_000)).toBe('Too many attempts. Wait 4 seconds before trying again.');
    expect(authThrottleMessage(0)).toContain('Wait 1 second');
  });
});

describe('session restoration timeout', () => {
  test('defaults to 30s, not the previous 15s cut-off', () => {
    expect(SESSION_RESTORE_TIMEOUT_MS).toBe(30_000);
    expect(resolveSessionRestoreTimeout()).toBe(30_000);
    expect(resolveSessionRestoreTimeout(undefined)).toBe(30_000);
  });

  test('accepts a safe override and clamps everything else to a bounded range', () => {
    expect(resolveSessionRestoreTimeout('20000')).toBe(20_000);
    expect(resolveSessionRestoreTimeout('5000')).toBe(5_000);
    expect(resolveSessionRestoreTimeout(String(MAX_SESSION_RESTORE_TIMEOUT_MS))).toBe(MAX_SESSION_RESTORE_TIMEOUT_MS);
    // Too aggressive, unbounded, or unusable values must not be honoured.
    expect(resolveSessionRestoreTimeout('1000')).toBe(SESSION_RESTORE_TIMEOUT_MS);
    expect(resolveSessionRestoreTimeout('60001')).toBe(SESSION_RESTORE_TIMEOUT_MS);
    expect(resolveSessionRestoreTimeout('0')).toBe(SESSION_RESTORE_TIMEOUT_MS);
    expect(resolveSessionRestoreTimeout('-5000')).toBe(SESSION_RESTORE_TIMEOUT_MS);
    expect(resolveSessionRestoreTimeout('soon')).toBe(SESSION_RESTORE_TIMEOUT_MS);
    expect(resolveSessionRestoreTimeout('999999999999')).toBe(SESSION_RESTORE_TIMEOUT_MS);
  });
});
