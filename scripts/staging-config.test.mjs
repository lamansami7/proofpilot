import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessStagingEnv, assessDeletionEnv, deletionStagingReady, envFileSafety } from './check-staging-config.mjs';

const REF = 'a'.repeat(20);
const READY = {
  PROOFPILOT_STAGING_PROJECT_REF: REF,
  EXPO_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fixture',
  PROOFPILOT_ALLOW_STAGING_TESTS: 'yes',
  PROOFPILOT_TEST_EMAIL_A: 'qa-a@example.test',
  PROOFPILOT_TEST_PASSWORD_A: 'staging-password-a',
  PROOFPILOT_TEST_EMAIL_B: 'qa-b@example.test',
  PROOFPILOT_TEST_PASSWORD_B: 'staging-password-b',
};
// Real Supabase service-role JWTs carry role "service_role" (there is no role named "service").
const SERVICE_JWT = `h.${Buffer.from(JSON.stringify({ iss: 'supabase', role: 'service_role' })).toString('base64url')}.s`;
const DELETION_READY = {
  ...READY,
  PROOFPILOT_DELETE_TEST_EMAIL: 'qa-delete@example.test',
  PROOFPILOT_DELETE_TEST_PASSWORD: 'disposable-password-1',
  PROOFPILOT_SERVICE_ROLE_KEY: SERVICE_JWT,
};

test('a complete staging environment is reported ready', () => {
  assert.deepEqual(assessStagingEnv(READY), { ready: true, problems: [] });
});

test('an empty environment names every missing variable without inventing values', () => {
  const { ready, problems } = assessStagingEnv({});
  const names = problems.map(([name]) => name);
  for (const name of ['PROOFPILOT_STAGING_PROJECT_REF', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'PROOFPILOT_ALLOW_STAGING_TESTS', 'PROOFPILOT_TEST_EMAIL_A', 'PROOFPILOT_TEST_PASSWORD_A', 'PROOFPILOT_TEST_EMAIL_B', 'PROOFPILOT_TEST_PASSWORD_B']) {
    assert.ok(names.some(value => value.startsWith(name)), `${name} must be reported`);
  }
  assert.equal(ready, false);
});

test('mismatched, privileged and placeholder values are rejected by kind, not by value', () => {
  const mismatch = assessStagingEnv({ ...READY, PROOFPILOT_STAGING_PROJECT_REF: 'b'.repeat(20) });
  assert.equal(mismatch.ready, false);
  assert.ok(mismatch.problems.some(([name, detail]) => name === 'EXPO_PUBLIC_SUPABASE_URL' && detail.includes('does not equal')));
  assert.ok(!JSON.stringify(mismatch.problems).includes(READY.EXPO_PUBLIC_SUPABASE_URL), 'configured URLs must never be echoed');

  const privileged = assessStagingEnv({ ...READY, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_not-a-client-key' });
  assert.equal(privileged.ready, false);
  assert.ok(privileged.problems.some(([name, detail]) => name === 'EXPO_PUBLIC_SUPABASE_ANON_KEY' && detail.includes('privileged')));
  assert.ok(!JSON.stringify(privileged.problems).includes('sb_secret_not-a-client-key'), 'key material must never be echoed');

  const serviceRoleJwt = assessStagingEnv({ ...READY, EXPO_PUBLIC_SUPABASE_ANON_KEY: `h.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.s` });
  assert.equal(serviceRoleJwt.ready, false);
  assert.ok(serviceRoleJwt.problems.some(([name]) => name === 'EXPO_PUBLIC_SUPABASE_ANON_KEY'));
});

test('repeated accounts, repeated passwords, short passwords and a disabled opt-in are refused', () => {
  const sameAccount = assessStagingEnv({ ...READY, PROOFPILOT_TEST_EMAIL_B: READY.PROOFPILOT_TEST_EMAIL_A.toUpperCase() });
  assert.ok(sameAccount.problems.some(([name]) => name === 'PROOFPILOT_TEST_EMAIL_A/B'));
  const samePassword = assessStagingEnv({ ...READY, PROOFPILOT_TEST_PASSWORD_B: READY.PROOFPILOT_TEST_PASSWORD_A });
  assert.ok(samePassword.problems.some(([name]) => name === 'PROOFPILOT_TEST_PASSWORD_A/B'));
  const short = assessStagingEnv({ ...READY, PROOFPILOT_TEST_PASSWORD_A: 'q7' });
  assert.ok(short.problems.some(([name, detail]) => name === 'PROOFPILOT_TEST_PASSWORD_A' && detail.includes('shorter than')));
  assert.ok(!JSON.stringify(short.problems).includes('q7'), 'a password value must never be echoed');
  const noOptIn = assessStagingEnv({ ...READY, PROOFPILOT_ALLOW_STAGING_TESTS: 'true' });
  assert.equal(noOptIn.ready, false);
  assert.ok(noOptIn.problems.some(([name]) => name === 'PROOFPILOT_ALLOW_STAGING_TESTS'));
});

test('env file safety distinguishes ignored, not ignored, tracked and missing files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'proofpilot-staging-safety-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    assert.equal(envFileSafety('.env.local', dir), 'missing');
    await writeFile(join(dir, '.env.local'), 'PROOFPILOT_ALLOW_STAGING_TESTS=yes\n');
    assert.equal(envFileSafety('.env.local', dir), 'not-ignored');
    await writeFile(join(dir, '.gitignore'), '.env.*\n');
    assert.equal(envFileSafety('.env.local', dir), 'ignored');
    execFileSync('git', ['add', '-f', '.env.local'], { cwd: dir });
    assert.equal(envFileSafety('.env.local', dir), 'tracked');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the repository ignores its own .env.local', () => {
  assert.equal(envFileSafety('.env.local', process.cwd()), 'missing');
  assert.equal(envFileSafety('.env.example', process.cwd()), 'tracked');
});

test('staging failure reports name the stage and never the underlying error text', async () => {
  const { liveFailureMessage } = await import('./live-report.mjs');
  const networkFailure = new Error('fetch failed: https://staging.supabase.co with token eyJhbGciOi.fake.token for qa-a@example.test');
  const message = liveFailureMessage('sign in dedicated test accounts', networkFailure);
  assert.match(message, /FAILED at stage: sign in dedicated test accounts/);
  assert.match(message, /request failed/);
  for (const leak of ['eyJhbGciOi', 'qa-a@example.test', 'staging.supabase.co', 'fetch failed']) {
    assert.ok(!message.includes(leak), `failure output must not contain ${leak}`);
  }

  const { AssertionError } = await import('node:assert');
  let assertionError;
  try { assert.equal(1, 2, 'tombstone visible for qa-a@example.test'); } catch (error) { assertionError = error; }
  assert.ok(assertionError instanceof AssertionError, 'the fixture must produce a real AssertionError');
  const assertionMessage = liveFailureMessage('cross-account read denial', assertionError);
  assert.match(assertionMessage, /assertion failed/);
  assert.ok(!assertionMessage.includes('qa-a@example.test'), 'assertion detail must not be echoed');
});

test('the live script still refuses to run without an explicit staging opt-in', async () => {
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, [new URL('./verify-live.mjs', import.meta.url).pathname], {
    encoding: 'utf8',
    env: { ...process.env, PROOFPILOT_ALLOW_STAGING_TESTS: '', PROOFPILOT_STAGING_PROJECT_REF: '' },
  });
  assert.equal(child.status, 2, child.stderr);
  assert.match(child.stderr, /Not run/);
});

test('the deletion matrix environment is validated by name, with safety rails', () => {
  assert.deepEqual(assessDeletionEnv(DELETION_READY), []);
  assert.equal(deletionStagingReady(DELETION_READY), true);
  assert.equal(deletionStagingReady(READY), false, 'base staging alone must not authorize the destructive matrix');

  const missing = assessDeletionEnv({ ...READY });
  const names = missing.map(([name]) => name);
  for (const name of ['PROOFPILOT_DELETE_TEST_EMAIL', 'PROOFPILOT_DELETE_TEST_PASSWORD', 'PROOFPILOT_SERVICE_ROLE_KEY']) {
    assert.ok(names.includes(name), `${name} must be reported when absent`);
  }

  const protectedAccount = assessDeletionEnv({ ...DELETION_READY, PROOFPILOT_DELETE_TEST_EMAIL: DELETION_READY.PROOFPILOT_TEST_EMAIL_A.toUpperCase() });
  assert.ok(protectedAccount.some(([name]) => name.startsWith('PROOFPILOT_DELETE_TEST_EMAIL/PROOFPILOT_TEST_EMAIL_A')), 'disposable account must never be QA A');
  const protectedB = assessDeletionEnv({ ...DELETION_READY, PROOFPILOT_DELETE_TEST_EMAIL: DELETION_READY.PROOFPILOT_TEST_EMAIL_B });
  assert.ok(protectedB.some(([name]) => name.includes('_B')), 'disposable account must never be QA B');

  const wrongKey = assessDeletionEnv({ ...DELETION_READY, PROOFPILOT_SERVICE_ROLE_KEY: `h.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.s` });
  assert.ok(wrongKey.some(([name, detail]) => name === 'PROOFPILOT_SERVICE_ROLE_KEY' && detail.includes('service-role')));

  const jwtWithRole = role => `h.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.s`;
  assert.deepEqual(assessDeletionEnv({ ...DELETION_READY, PROOFPILOT_SERVICE_ROLE_KEY: 'sb_secret_AbCdEf123456_-xyz' }), [], 'opaque sb_secret_ keys are accepted');
  for (const role of ['service', 'authenticated', 'supabase_admin']) {
    assert.ok(assessDeletionEnv({ ...DELETION_READY, PROOFPILOT_SERVICE_ROLE_KEY: jwtWithRole(role) }).some(([name]) => name === 'PROOFPILOT_SERVICE_ROLE_KEY'), `role "${role}" is not a service-role key`);
  }
  assert.ok(assessDeletionEnv({ ...DELETION_READY, PROOFPILOT_SERVICE_ROLE_KEY: 'sb_publishable_AbCdEf123456' }).some(([name]) => name === 'PROOFPILOT_SERVICE_ROLE_KEY'), 'a publishable key is never a service key');
  assert.ok(!JSON.stringify(assessDeletionEnv({ ...DELETION_READY, PROOFPILOT_SERVICE_ROLE_KEY: jwtWithRole('anon') })).includes(jwtWithRole('anon')), 'key material must never be echoed');

  const garbageKey = assessDeletionEnv({ ...DELETION_READY, PROOFPILOT_SERVICE_ROLE_KEY: 'not-a-jwt' });
  assert.ok(garbageKey.some(([name]) => name === 'PROOFPILOT_SERVICE_ROLE_KEY'));

  const shortPassword = assessDeletionEnv({ ...DELETION_READY, PROOFPILOT_DELETE_TEST_PASSWORD: 'q7' });
  assert.ok(shortPassword.some(([name, detail]) => name === 'PROOFPILOT_DELETE_TEST_PASSWORD' && detail.includes('shorter than')));
  assert.ok(!JSON.stringify(assessDeletionEnv(DELETION_READY)).includes(DELETION_READY.PROOFPILOT_DELETE_TEST_EMAIL), 'emails must never be echoed in reports');
});

test('the deletion matrix script still refuses to run without its extra configuration', async () => {
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, [new URL('./verify-deletion-live.mjs', import.meta.url).pathname], {
    encoding: 'utf8',
    env: { ...process.env, PROOFPILOT_ALLOW_STAGING_TESTS: '', PROOFPILOT_STAGING_PROJECT_REF: '' },
  });
  assert.equal(child.status, 2, child.stderr);
  assert.match(child.stderr, /Not run: deletion matrix needs/);
  assert.ok(!child.stderr.includes('@'), 'refusal output must not contain any email');
});

test('the storage matrix script still refuses to run without staging configuration', async () => {
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, [new URL('./verify-storage-live.mjs', import.meta.url).pathname], {
    encoding: 'utf8',
    env: { ...process.env, PROOFPILOT_ALLOW_STAGING_TESTS: '', PROOFPILOT_STAGING_PROJECT_REF: '' },
  });
  assert.equal(child.status, 2, child.stderr);
  assert.match(child.stderr, /Not run: storage verification needs/);
});
