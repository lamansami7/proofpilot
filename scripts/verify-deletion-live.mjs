// P1 destructive acceptance: the 19-item deletion matrix plus lost-response recovery,
// run against the identified staging project with a THIRD disposable QA account.
//
// SAFETY RAILS (enforced in code, before any destructive call):
//  - QA accounts A and B are NEVER deleted and their credentials are never used
//    for any delete-account request; they only sign in for intactness checks.
//  - The disposable account (PROOFPILOT_DELETE_TEST_EMAIL) is created by this script with a marker in its
//    user_metadata and destroyed at the end of the run. An address that already exists WITHOUT the marker is
//    refused (exit 2) unless the operator sets PROOFPILOT_DELETE_TEST_CONFIRM_RESET=yes, so a mistyped address
//    can never delete a real account. Its credentials live only in the environment.
//  - Output is fixed stage literals only: no token, email, URL, id or record content.
//  - Privileged evidence (auth absence, storage emptiness, cascades) uses the operator's
//    PROOFPILOT_SERVICE_ROLE_KEY locally; normal user sessions provide all RLS evidence. A privileged query that
//    fails is a FAILURE, never read as "zero rows".
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { serviceRoleKey, stagingConfigured } from './release-config.mjs';
import { assessDeletionEnv } from './check-staging-config.mjs';
import { loadLocalEnv } from './load-local-env.mjs';
import { liveFailureMessage } from './live-report.mjs';
import { DISPOSABLE_MARKER, actionLinkOf, evidenceRows, findUserByEmail, isMarkedDisposable, purgeStoragePrefix } from './live-helpers.mjs';
loadLocalEnv();
const env = process.env;
const missing = [];
if (!stagingConfigured(env)) missing.push('base staging configuration (check:staging)');
missing.push(...assessDeletionEnv(env).map(([name]) => name));
if (missing.length) {
  console.error(`Not run: deletion matrix needs ${missing.join(', ')}. Values are never printed.`);
  process.exit(2);
}

const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL_C = env.PROOFPILOT_DELETE_TEST_EMAIL.trim();
const EMAIL_A = env.PROOFPILOT_TEST_EMAIL_A.trim();
const EMAIL_B = env.PROOFPILOT_TEST_EMAIL_B.trim();
const sameEmail = (x, y) => x.toLowerCase() === y.toLowerCase();
const BUCKET = 'purchase-documents';
const PDF = new TextEncoder().encode('%PDF-1.4\n% ProofPilot deletion probe\n');
const MASS_COUNT = 1010; // must exceed the 1,000-object per-attempt cleanup cap
const DEEP_PATH = uid => `${uid}/d1/d2/d3/d4/d5/d6/d7/d8/d9/deep.pdf`; // depth 9 trips the function's depth-8 guard
const newReceipt = () => crypto.randomBytes(32).toString('base64url'); // 43 chars, client contract
const make = () => createClient(URL_BASE, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(URL_BASE, env.PROOFPILOT_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const c = make(); // the ONLY client ever used against delete-account
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const post = async (path, body, token, timeoutMs = 60000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'Content-Type': 'application/json', apikey: ANON };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${URL_BASE}${path}`, { method: 'POST', signal: controller.signal, redirect: 'error', headers, body: JSON.stringify(body) });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    return { status: response.status, payload };
  } finally { clearTimeout(timer); }
};
const deleteRequest = (body, token) => post('/functions/v1/delete-account', body, token);
const receiptStatus = async receipt => (await deleteRequest({ receipt }, null)).payload;
let stage = 'startup';
let passed = 0;
const pass = name => { passed++; console.log(`PASS ${name}`); };
const assertStatus = (result, status, code) => {
  assert.equal(result.status, status, `expected HTTP ${status}`);
  if (code) assert.equal(result.payload?.error, code, `expected error code ${code}`);
};
const seedRecord = tag => ({ id: `qa-delete-${tag}-${crypto.randomUUID()}`, name: `QA deletion ${tag}`, price: 0, purchaseDate: '2026-01-01', documents: [], deadlines: [] });
const saveRecord = seedRecord('freeze-probe');
let uidA = null, uidB = null, uidC = null;
let sessionToken = null, sessionRefresh = null;

class Refusal extends Error {}
const rowsFor = (table, column, id) => evidenceRows(admin.from(table).select(column).eq('user_id', id));
const auth404 = async uid => {
  const { data, error } = await admin.auth.admin.getUserById(uid);
  assert.ok(!data?.user, 'auth user must be gone');
  assert.ok(error && (error.status === 404 || error.code === 'user_not_found'), 'Auth must answer user-not-found, not an unrelated or transient error');
};
const authPresent = async (uid, message) => { const { data, error } = await admin.auth.admin.getUserById(uid); assert.ifError(error); assert.ok(data?.user, message); };
const listRoot = async uid => { const { data, error } = await admin.storage.from(BUCKET).list(uid, { limit: 100 }); assert.ifError(error); return data ?? []; };
/** Removes leftover residue of the disposable address: Storage first, then Auth. Refuses foreign accounts. */
const removeLeftoverDisposable = async () => {
  const existing = await findUserByEmail(admin, EMAIL_C);
  if (!existing) return false;
  assert.ok(!sameEmail(EMAIL_C, EMAIL_A) && !sameEmail(EMAIL_C, EMAIL_B), 'the disposable address must never be a QA account');
  if (!isMarkedDisposable(existing) && env.PROOFPILOT_DELETE_TEST_CONFIRM_RESET !== 'yes') {
    throw new Refusal('Not run: the disposable address already exists but was not created by this script. Set PROOFPILOT_DELETE_TEST_CONFIRM_RESET=yes only if that address really is the third, disposable QA account.');
  }
  await purgeStoragePrefix(admin.storage.from(BUCKET), existing.id);
  const { error } = await admin.auth.admin.deleteUser(existing.id);
  assert.ifError(error);
  return true;
};
const createDisposable = async () => {
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL_C, password: env.PROOFPILOT_DELETE_TEST_PASSWORD, email_confirm: true, user_metadata: { [DISPOSABLE_MARKER]: true } });
  assert.ifError(error);
  assert.ok(data?.user?.id);
  assert.ok(data.user.id !== uidA && data.user.id !== uidB, 'the disposable account must be a distinct identity');
  return data.user.id;
};
const signInDisposable = async () => {
  const { data, error } = await c.auth.signInWithPassword({ email: EMAIL_C, password: env.PROOFPILOT_DELETE_TEST_PASSWORD });
  assert.ifError(error);
  sessionToken = data.session.access_token;
  sessionRefresh = data.session.refresh_token;
  assert.ok(sessionToken && sessionRefresh);
};
const seedDatabase = async (tag) => {
  const { error: saveError } = await c.rpc('save_purchase_record', { record: seedRecord(tag) });
  assert.ifError(saveError);
  const { error: tombError } = await c.rpc('delete_purchase_record', { record_id: `qa-delete-tombstone-${crypto.randomUUID()}` });
  assert.ifError(tombError);
  assert.equal((await rowsFor('purchases', 'id', uidC)).length, 1, 'the seed purchase must exist before deletion');
  assert.equal((await rowsFor('purchase_tombstones', 'record_id', uidC)).length, 1, 'the seed tombstone must exist before deletion');
};
const assertDatabaseEmpty = async () => {
  for (const [table, column] of [['purchases', 'id'], ['purchase_tombstones', 'record_id'], ['documents', 'id'], ['account_deletion_requests', 'user_id']]) {
    assert.equal((await rowsFor(table, column, uidC)).length, 0, `${table} rows must be gone`);
  }
};

try {
  // ---- Safety rails (before any request) ----
  stage = 'refuse destructive run when the disposable account matches a QA account';
  assert.ok(!sameEmail(EMAIL_C, EMAIL_A) && !sameEmail(EMAIL_C, EMAIL_B), 'disposable account must differ from QA A and B');
  assert.ok(!sameEmail(EMAIL_A, EMAIL_B), 'QA accounts must be distinct');
  pass(stage);

  stage = 'refuse destructive run without a service-role evidence key';
  assert.ok(serviceRoleKey(env.PROOFPILOT_SERVICE_ROLE_KEY), 'privileged evidence key must be a service-role key');
  pass(stage);

  // ---- 1. Disposable account lifecycle ----
  stage = 'reset the disposable deletion account to a known state';
  {
    const a = await findUserByEmail(admin, EMAIL_A), b = await findUserByEmail(admin, EMAIL_B);
    assert.ok(a && b, 'QA accounts A and B must exist');
    uidA = a.id; uidB = b.id;
    await removeLeftoverDisposable();
    uidC = await createDisposable();
    pass(stage);
  }

  stage = 'sign in disposable account with a fresh password proof';
  await signInDisposable();
  pass(stage);
  const firstProofAt = Date.now();

  // ---- 2. Non-destructive guard stages ----
  stage = 'missing password proof is refused without any cloud work';
  {
    const { data: generated, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL_C });
    assert.ifError(error);
    const actionLink = actionLinkOf(generated);
    assert.ok(actionLink, 'magiclink action link required for the passwordless-session probe');
    const verifyResponse = await fetch(actionLink, { redirect: 'manual' });
    const location = verifyResponse.headers.get('location');
    assert.ok(location, 'verify step must redirect with a session fragment');
    const params = new URLSearchParams(new URL(location).hash.slice(1));
    const magicToken = params.get('access_token');
    assert.ok(magicToken, 'passwordless session token required');
    const claims = JSON.parse(Buffer.from(magicToken.split('.')[1], 'base64url').toString());
    assert.equal(claims.sub, uidC, 'passwordless session must belong to the disposable account');
    assert.ok(!(claims.amr ?? []).some(item => item.method === 'password'), 'fixture must contain no password proof');
    const result = await deleteRequest({ confirmation: 'DELETE' }, magicToken);
    assertStatus(result, 403, 'recent_password_required');
    await authPresent(uidC, 'refused attempt must not delete auth');
    assert.equal((await rowsFor('account_deletion_requests', 'user_id', uidC)).length, 0, 'refused attempt must not create a deletion request');
    pass(stage);
  }

  stage = 'unknown receipt probes report unknown and never completion';
  {
    const body = await receiptStatus(newReceipt());
    assert.equal(body?.deleted, false);
    assert.equal(body?.state, 'unknown');
    assert.equal(body?.userId, undefined);
    pass(stage);
  }

  stage = 'forged deletion target fields are rejected without cloud work';
  {
    for (const key of ['userId', 'user_id', 'id', 'target', 'account', 'email']) {
      const result = await deleteRequest({ confirmation: 'DELETE', [key]: key === 'email' ? EMAIL_B : uidB }, sessionToken);
      assertStatus(result, 400, 'confirmation_required');
    }
    assert.equal((await rowsFor('account_deletion_requests', 'user_id', uidC)).length, 0, 'forged request must not freeze the caller');
    assert.equal((await rowsFor('account_deletion_requests', 'user_id', uidB)).length, 0, 'forged request must not freeze the named account');
    await authPresent(uidB, 'forged request must not delete the named account');
    pass(stage);
  }

  stage = 'wrong-account attempts leave QA accounts A and B intact';
  {
    for (const [email, password, label, uid] of [[EMAIL_A, env.PROOFPILOT_TEST_PASSWORD_A, 'A', uidA], [EMAIL_B, env.PROOFPILOT_TEST_PASSWORD_B, 'B', uidB]]) {
      const probe = make();
      const { data, error } = await probe.auth.signInWithPassword({ email, password });
      assert.ifError(error);
      assert.equal(data.user?.id, uid, `QA ${label} must still be the same account`);
      await probe.auth.signOut({ scope: 'local' });
    }
    pass(stage);
  }

  // ---- 3. Storage and database fixtures (normal authenticated user) ----
  stage = 'upload flat and nested storage fixtures as the disposable user';
  {
    const bucket = c.storage.from(BUCKET);
    for (const path of [`${uidC}/probe.pdf`, `${uidC}/nested/dir/probe.pdf`, DEEP_PATH(uidC)]) {
      const { error } = await bucket.upload(path, PDF, { contentType: 'application/pdf' });
      assert.ifError(error);
    }
    pass(stage);
  }

  stage = 'seed purchase and tombstone rows that the deletion must cascade away';
  await seedDatabase('seed');
  pass(stage);

  stage = 'upload more than 1,000 storage objects as the disposable user';
  {
    const bucket = c.storage.from(BUCKET);
    for (let i = 1; i <= MASS_COUNT; i++) {
      const path = `${uidC}/mass/m${String(i).padStart(4, '0')}.pdf`;
      let error = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        ({ error } = await bucket.upload(path, PDF, { contentType: 'application/pdf' }));
        if (!error) break;
        await sleep(1500); // brief backoff for transient storage rate limits
      }
      assert.ifError(error);
    }
    pass(stage);
  }

  stage = 'stale password proof beyond five minutes is refused without cloud work';
  {
    const remaining = Math.max(0, 301_000 - (Date.now() - firstProofAt));
    if (remaining > 0) console.log(`INFO waiting out the remaining recent-password window before the stale-proof probe (${Math.ceil(remaining / 1000)}s)`);
    await sleep(remaining);
    const result = await deleteRequest({ confirmation: 'DELETE' }, sessionToken);
    assertStatus(result, 403, 'recent_password_required');
    await authPresent(uidC, 'stale-proof refusal must not delete auth');
    assert.equal((await rowsFor('account_deletion_requests', 'user_id', uidC)).length, 0, 'stale-proof refusal must not create a deletion request');
    pass(stage);
  }

  // ---- 4. Destructive matrix ----
  stage = 'deletion with a broken storage hierarchy fails without reporting success';
  const receipt1 = newReceipt();
  {
    await signInDisposable();
    const result = await deleteRequest({ confirmation: 'DELETE', receipt: receipt1 }, sessionToken);
    assert.equal(result.status, 503, 'deep hierarchy must fail cleanup');
    assert.notEqual(result.payload?.deleted, true, 'failure must never report successful deletion');
    pass(stage);
  }

  stage = 'failed attempt created the durable deletion request';
  assert.equal((await rowsFor('account_deletion_requests', 'user_id', uidC)).length, 1, 'deletion request row must exist after begin');
  pass(stage);

  stage = 'auth survives failed storage cleanup';
  {
    await authPresent(uidC, 'auth must not disappear before cleanup succeeds');
    assert.ok((await listRoot(uidC)).length > 0, 'storage fixtures must still exist');
    pass(stage);
  }

  stage = 'cloud writes are frozen during cleanup retry';
  {
    const { error: saveError } = await c.rpc('save_purchase_record', { record: saveRecord });
    assert.ok(saveError, 'database writes must be frozen');
    assert.match(String(saveError.message), /Account deletion is in progress/i, 'database writes must be refused by the closing-account guard');
    const { error: uploadError } = await c.storage.from(BUCKET).upload(`${uidC}/during-freeze.pdf`, PDF, { contentType: 'application/pdf' });
    assert.ok(uploadError, 'storage uploads must be frozen');
    // Nothing slipped through either channel.
    assert.equal((await rowsFor('purchases', 'id', uidC)).length, 1, 'only the seeded purchase may exist');
    assert.ok(!(await listRoot(uidC)).some(entry => entry.name === 'during-freeze.pdf'), 'no object may be created during the freeze');
    pass(stage);
  }

  stage = 'in-progress receipt reports pending, never completed';
  {
    const body = await receiptStatus(receipt1);
    assert.equal(body?.deleted, false, 'pending receipt must not read as deleted');
    assert.equal(body?.state, 'pending');
    assert.equal(body?.userId, uidC);
    pass(stage);
  }

  stage = 'owner removes the blocking deep object to exercise storage retry';
  {
    const { data, error } = await c.storage.from(BUCKET).remove([DEEP_PATH(uidC)]);
    assert.ifError(error);
    assert.equal(data?.length, 1, 'the owner must be able to delete their own object');
    pass(stage);
  }

  stage = 'retry with more than 1,000 objects pauses cleanup and keeps auth';
  const receipt2 = newReceipt();
  {
    await signInDisposable();
    const result = await deleteRequest({ confirmation: 'DELETE', receipt: receipt2 }, sessionToken);
    assertStatus(result, 409, 'cleanup_pending_retry');
    assert.notEqual(result.payload?.deleted, true);
    await authPresent(uidC, 'auth must survive the cleanup cap');
    assert.ok((await listRoot(uidC)).length > 0, 'objects must remain for the retry');
    pass(stage);
  }

  stage = 'final retry completes deletion after cleanup finishes';
  {
    await signInDisposable();
    const result = await deleteRequest({ confirmation: 'DELETE', receipt: receipt2 }, sessionToken);
    assert.equal(result.status, 200, 'final retry must succeed');
    assert.equal(result.payload?.deleted, true);
    pass(stage);
  }

  stage = 'auth user is deleted only after cleanup completed';
  await auth404(uidC);
  pass(stage);

  stage = 'storage objects are fully removed';
  {
    const { data, error } = await admin.storage.from(BUCKET).list(uidC, { limit: 10 });
    assert.ifError(error);
    assert.equal((data ?? []).length, 0, 'no storage objects may remain under the deleted prefix');
    pass(stage);
  }

  stage = 'database records are cascade-removed';
  await assertDatabaseEmpty();
  pass(stage);

  stage = 'completed receipt confirms repeatedly and idempotently';
  {
    for (let i = 0; i < 2; i++) {
      const body = await receiptStatus(receipt2);
      assert.equal(body?.deleted, true);
      assert.equal(body?.state, 'completed');
      assert.equal(body?.userId, uidC);
    }
    pass(stage);
  }

  stage = 'old session cannot write after deletion';
  {
    // Raw REST with the still-unexpired access token: the strongest possible
    // "deleted account keeps trying to write" probe. No client auth state involved.
    const headers = { 'Content-Type': 'application/json', Prefer: 'return=representation', apikey: ANON, Authorization: `Bearer ${sessionToken}` };
    const rpcResponse = await fetch(`${URL_BASE}/rest/v1/rpc/save_purchase_record`, {
      method: 'POST', redirect: 'error', headers, body: JSON.stringify({ record: saveRecord }),
    });
    assert.ok(rpcResponse.status >= 400, 'stale session RPC write must fail');
    const insertResponse = await fetch(`${URL_BASE}/rest/v1/purchases`, {
      method: 'POST', redirect: 'error', headers,
      body: JSON.stringify({ user_id: uidC, product_name: 'Resurrect attempt' }),
    });
    assert.ok(insertResponse.status >= 400, 'stale session table write must fail');
    pass(stage);
  }

  stage = 'stale refresh token cannot resurrect the account';
  {
    const response = await fetch(`${URL_BASE}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', apikey: ANON },
      body: JSON.stringify({ refresh_token: sessionRefresh, grant_type: 'refresh_token' }),
    });
    assert.ok(response.status >= 400 && response.status < 500, 'refresh after deletion must be refused by Auth');
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    assert.ok(!body?.access_token, 'refresh after deletion must not mint a session');
    pass(stage);
  }

  stage = 'deleted purchases remain deleted after write attempts';
  {
    await assertDatabaseEmpty();
    await auth404(uidC);
    pass(stage);
  }

  stage = 'repeated deletion attempt cannot run without a session';
  {
    const result = await deleteRequest({ confirmation: 'DELETE' }, sessionToken);
    assertStatus(result, 401, 'invalid_session');
    pass(stage);
  }

  // ---- 5. Lost-final-response recovery (receipt protocol) ----
  stage = 'recreate the disposable account for lost-response verification';
  {
    await removeLeftoverDisposable();
    uidC = await createDisposable();
    await signInDisposable();
    const { error: uploadError } = await c.storage.from(BUCKET).upload(`${uidC}/probe.pdf`, PDF, { contentType: 'application/pdf' });
    assert.ifError(uploadError);
    await seedDatabase('lost-response');
    pass(stage);
  }

  stage = 'discarded deletion response is confirmed only by receipt status';
  const receipt3 = newReceipt();
  {
    // The response is deliberately treated as lost: nothing is read from it.
    await deleteRequest({ confirmation: 'DELETE', receipt: receipt3 }, sessionToken);
    let body = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      body = await receiptStatus(receipt3);
      if (body?.state === 'completed') break;
      await sleep(2000);
    }
    assert.equal(body?.deleted, true, 'receipt must confirm the completed deletion');
    assert.equal(body?.state, 'completed');
    assert.equal(body?.userId, uidC);
    pass(stage);
  }

  stage = 'server state matches the receipt after a lost response';
  {
    await auth404(uidC);
    const { data: files, error: listError } = await admin.storage.from(BUCKET).list(uidC, { limit: 5 });
    assert.ifError(listError);
    assert.equal((files ?? []).length, 0, 'storage must be gone');
    await assertDatabaseEmpty();
    const body = await receiptStatus(receipt3);
    assert.equal(body?.state, 'completed', 'status stays idempotent after verification');
    pass(stage);
  }

  stage = 'QA accounts A and B remain intact at the end of the run';
  {
    for (const [email, password, label, uid] of [[EMAIL_A, env.PROOFPILOT_TEST_PASSWORD_A, 'A', uidA], [EMAIL_B, env.PROOFPILOT_TEST_PASSWORD_B, 'B', uidB]]) {
      await authPresent(uid, `QA ${label} must survive the destructive run`);
      const probe = make();
      const { data, error } = await probe.auth.signInWithPassword({ email, password });
      assert.ifError(error);
      assert.equal(data.user?.id, uid, `QA ${label} must still be the same account`);
      await probe.auth.signOut({ scope: 'local' });
    }
    pass(stage);
  }

  console.log(`Deletion matrix checks passed: ${passed} stages — recent/missing/stale proof, forged target, wrong-account, request creation, freeze, partial failure, retry, >1,000 objects, Auth-last ordering, seeded cascades, persistence, no resurrection, idempotent receipt, lost-response recovery, QA A/B intact. Not an SMTP/device/full release certification.`);
} catch (error) {
  if (error instanceof Refusal) { console.error(error.message); process.exitCode = 2; }
  else { console.error(liveFailureMessage(stage, error)); process.exitCode = 1; }
} finally {
  // Leave no disposable residue: the disposable account (only) is removed if still present.
  try { await removeLeftoverDisposable(); } catch { /* best effort; the account is disposable and re-reset at the start */ }
  try { await c.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
}
