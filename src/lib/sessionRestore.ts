/**
 * Session restoration must never hang forever, but it must also not fail a real
 * user on a slow or briefly offline connection. The audit raised the previous
 * 15 second timeout; 30 seconds is the new default and the value stays tunable
 * per environment without ever allowing an unbounded wait.
 */
export const SESSION_RESTORE_TIMEOUT_MS = 30_000;
export const MIN_SESSION_RESTORE_TIMEOUT_MS = 5_000;
export const MAX_SESSION_RESTORE_TIMEOUT_MS = 60_000;

/** Clamps a configured override into a safe range; anything unusable falls back to the default. */
export function resolveSessionRestoreTimeout(value?: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return SESSION_RESTORE_TIMEOUT_MS;
  const bounded = Math.trunc(parsed);
  if (bounded < MIN_SESSION_RESTORE_TIMEOUT_MS || bounded > MAX_SESSION_RESTORE_TIMEOUT_MS) return SESSION_RESTORE_TIMEOUT_MS;
  return bounded;
}
