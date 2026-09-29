/**
 * Client-side attempt throttle for the authentication screen.
 *
 * THIS IS NOT A SECURITY BOUNDARY. Supabase's server-side rate limiting, CAPTCHA
 * and email-confirmation rules remain the real control; anyone can bypass this by
 * calling the Supabase API directly. This throttle exists for two narrower reasons:
 *   1. a person re-tapping "Sign in" must not hammer the provider into a server lockout, and
 *   2. the UI can tell the truth about how long to wait instead of failing opaquely.
 *
 * Deliberately in-memory only. Email addresses, counters and timestamps are never
 * written to disk, and no value from a provider response is echoed back to the user.
 */

export const AUTH_ATTEMPT_LIMIT = 8;
export const AUTH_ATTEMPT_WINDOW_MS = 60_000;
export const AUTH_RATE_LIMIT_COOLDOWN_MS = 30_000;

/** Provider messages that mean "the server just refused further attempts". */
const RATE_LIMITED = /\brate[\s_-]*limit|too many requests|\b429\b|too many attempts|security purposes/i;

/** True when a provider error indicates server-side throttling rather than bad input. */
export function isRateLimitedError(message: string): boolean {
  return RATE_LIMITED.test(message ?? '');
}

/** Human-readable, value-free message for a wait that the throttle imposes. */
export function authThrottleMessage(waitMs: number): string {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  return `Too many attempts. Wait ${seconds} second${seconds === 1 ? '' : 's'} before trying again.`;
}

export type AuthThrottle = {
  /** Milliseconds until the next attempt is allowed; 0 when an attempt may proceed. */
  remaining(now?: number): number;
  /** Registers one completed provider attempt and returns the resulting wait. */
  record(now?: number): number;
  /** Starts a cooldown after the provider reported rate limiting. */
  penalize(now?: number): void;
  /** Clears the window after a successful sign-in. */
  reset(): void;
};

export function createAuthThrottle(
  options: { limit?: number; windowMs?: number; cooldownMs?: number; now?: () => number } = {},
): AuthThrottle {
  const limit = Math.max(1, Math.trunc(options.limit ?? AUTH_ATTEMPT_LIMIT));
  const windowMs = Math.max(1, Math.trunc(options.windowMs ?? AUTH_ATTEMPT_WINDOW_MS));
  const cooldownMs = Math.max(0, Math.trunc(options.cooldownMs ?? AUTH_RATE_LIMIT_COOLDOWN_MS));
  const now = options.now ?? Date.now;
  let attempts: number[] = [];
  let cooldownUntil = 0;

  const prune = (at: number) => {
    attempts = attempts.filter(stamp => at - stamp < windowMs);
  };

  return {
    remaining(at = now()) {
      prune(at);
      const cooldown = cooldownUntil - at;
      if (cooldown > 0) return cooldown;
      if (attempts.length < limit) return 0;
      return attempts[0] + windowMs - at;
    },
    record(at = now()) {
      prune(at);
      attempts = [...attempts, at];
      return this.remaining(at);
    },
    penalize(at = now()) {
      // Never shorten a cooldown that is already running.
      cooldownUntil = Math.max(cooldownUntil, at + cooldownMs);
    },
    reset() {
      attempts = [];
      cooldownUntil = 0;
    },
  };
}
