// Stage reporting for the destructive staging live test.
// The message is assembled from fixed literals only: an operator must be able to see
// exactly where the run stopped without any token, email, URL or record content in it.
import assert from 'node:assert/strict';

/** Human-readable, value-free description of a staging failure. */
export function liveFailureMessage(stage, error) {
  const kind = error instanceof assert.AssertionError ? 'assertion failed' : 'request failed';
  return `Live staging verification FAILED at stage: ${stage} (${kind}). `
    + 'No tokens, emails or record contents are logged. Inspect staging configuration and run local migration tests.';
}
