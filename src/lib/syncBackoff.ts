/**
 * Bounded retry pacing for cloud sync.
 *
 * Network and Supabase failures are frequently transient, so a single failed pass
 * should not force the user to tap "Retry". The ladder is strictly bounded: one
 * sync trigger performs at most MAX_SYNC_ATTEMPTS passes, then surfaces the error
 * for a human. No code path here can retry forever, and a successful pass resets
 * the counter so ordinary use never accumulates attempts.
 */
export const MAX_SYNC_ATTEMPTS = 4;
export const MAX_SYNC_ROUNDS = 3;
export const BASE_SYNC_RETRY_MS = 1_000;
export const MAX_SYNC_RETRY_MS = 30_000;

/** Server-side refusals: retrying cannot help and would just burn provider quota. */
const PERMANENT = /jwt|token|not authenticated|unauthori[sz]|permission|row level security|pgrst|42501|\b401\b|\b403\b|schema|does not exist|not configured|account changed|invalid record|unreadable/i;

/** Transient conditions worth one more bounded attempt. */
const TRANSIENT = /network|fetch|timeout|timed out|socket hang up|econn|enotfound|eai_again|epipe|abort|\b429\b|rate limit|too many|overloaded|unavailable|bad gateway|service unavailable|gateway time|internal server error|\b5\d\d\b/i;

/**
 * True when another attempt could plausibly succeed. A provider rate limit is
 * deliberately retryable; an auth, permission or schema failure is not.
 */
export function isRetryableSyncError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (!message.trim()) return true;
  if (PERMANENT.test(message)) return false;
  return TRANSIENT.test(message);
}

/**
 * Capped exponential backoff with equal jitter. Jitter keeps many clients from
 * retrying in lockstep after a shared outage; the result is always within
 * [delay/2, delay] and never exceeds maxMs.
 */
export function syncRetryDelay(
  attempt: number,
  options: { baseMs?: number; maxMs?: number; random?: () => number } = {},
): number {
  const base = Math.max(1, options.baseMs ?? BASE_SYNC_RETRY_MS);
  const max = Math.max(base, options.maxMs ?? MAX_SYNC_RETRY_MS);
  const random = options.random ?? Math.random;
  // Clamp the exponent, not its value: a bounded step keeps 2**step finite.
  const step = Math.max(0, Math.min(30, (Number.isFinite(attempt) ? attempt : 1) - 1));
  const ceiling = Math.min(max, base * 2 ** step);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/** True while the bounded attempt budget still has room. */
export function canRetrySync(attempt: number): boolean {
  return Number.isFinite(attempt) && attempt + 1 < MAX_SYNC_ATTEMPTS;
}
