// Offline regression tests for the live-verification scripts. They run against the INSTALLED supabase-js
// (no network, no credentials) so the classes of defect found when the merged scripts were first executed
// cannot return: calling admin methods that do not exist, misreading response shapes, treating a failed
// privileged query as "zero rows", and deleting anything but the disposable account.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { serviceRoleKey } from './release-config.mjs';
import { DISPOSABLE_MARKER, actionLinkOf, evidenceRows, findUserByEmail, isMarkedDisposable, purgeStoragePrefix } from './live-helpers.mjs';

const fakeJwt = claims => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const client = fetchImpl => createClient('http://stub.test', fakeJwt({ role: 'service_role' }), { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchImpl } });
const source = async name => readFile(new URL(`./${name}`, import.meta.url), 'utf8');
const LIVE_SCRIPTS = ['verify-live.mjs', 'verify-storage-live.mjs', 'verify-deletion-live.mjs', 'live-helpers.mjs'];

test('every admin API method the live scripts call exists in the installed auth-js', async () => {
  const admin = client(async () => json(200, {})).auth.admin;
  const available = new Set(Object.getOwnPropertyNames(Object.getPrototypeOf(admin)));
  let checked = 0;
  for (const file of LIVE_SCRIPTS) {
    for (const [, method] of (await source(file)).matchAll(/\.auth\.admin\.(\w+)\(/g)) {
      assert.ok(available.has(method), `${file} calls admin.${method}(), which is not in auth-js (available: ${[...available].join(', ')})`);
      checked++;
    }
  }
  assert.ok(checked >= 6, 'the scan must actually find admin calls');
  assert.ok(!available.has('getUserByEmail'), 'regression guard: supabase-js v2 has no getUserByEmail');
});

test('every Storage method the live scripts call exists, and remove() always receives an array', async () => {
  const api = client(async () => json(200, {})).storage.from('purchase-documents');
  const available = new Set(Object.getOwnPropertyNames(Object.getPrototypeOf(api)));
  for (const file of LIVE_SCRIPTS) {
    const text = await source(file);
    const called = [...text.matchAll(/(?:bucket\([^)]*\)|bucket|storage\.from\([^)]*\)|bucketApi)\.(\w+)\(/g)].map(match => match[1]);
    for (const method of called) assert.ok(available.has(method), `${file} calls storage ${method}(), which does not exist`);
    for (const [, argument] of text.matchAll(/(?<!bucketApi)\.remove\(\s*(\S)/g)) assert.equal(argument, '[', `${file}: remove() must be given an array, never a bare string`);
    for (const [, argument] of text.matchAll(/bucketApi\.remove\(\s*(\w)/g)) assert.equal(argument, 'f', `${file}: bucketApi.remove() must be given the collected files array`);
  }
});

test('findUserByEmail pages through listUsers and matches the exact address, case-insensitively', async () => {
  const calls = [];
  const users = ['a@x.test', 'aa@x.test', 'b@x.test', 'c@x.test', 'Target@X.test'].map((email, i) => ({ id: `id-${i}`, email }));
  const admin = client(async url => {
    const u = new URL(url); calls.push(u.searchParams.toString());
    const page = Number(u.searchParams.get('page')), perPage = Number(u.searchParams.get('per_page'));
    return json(200, { users: users.slice((page - 1) * perPage, page * perPage), aud: 'authenticated' });
  });
  const found = await findUserByEmail(admin, ' target@x.test ', { perPage: 2 });
  assert.equal(found.id, 'id-4');
  assert.deepEqual(calls, ['page=1&per_page=2', 'page=2&per_page=2', 'page=3&per_page=2']);
  assert.equal((await findUserByEmail(admin, 'a@x.test', { perPage: 2 })).id, 'id-0', 'a substring such as aa@ must never match');
  assert.equal(await findUserByEmail(admin, 'nobody@x.test', { perPage: 2 }), null, 'absent only after the final short page');
});

test('findUserByEmail never reads an API failure or an exhausted budget as "absent"', async () => {
  const failing = client(async () => json(500, { msg: 'boom' }));
  await assert.rejects(findUserByEmail(failing, 'x@x.test'));
  const endless = client(async () => json(200, { users: [{ id: 'u', email: 'other@x.test' }, { id: 'v', email: 'more@x.test' }] }));
  await assert.rejects(findUserByEmail(endless, 'x@x.test', { perPage: 2, maxPages: 3 }), /page budget/);
  await assert.rejects(findUserByEmail(endless, '   '), /required/);
});

test('generateLink exposes the action link under data.properties, not on data', async () => {
  const admin = client(async () => json(200, { id: 'u1', email: 'c@x.test', action_link: 'https://p.test/auth/v1/verify?token=t', email_otp: '123456', hashed_token: 'h', redirect_to: 'http://localhost', verification_type: 'magiclink' }));
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'c@x.test' });
  assert.equal(error, null);
  assert.equal(data.action_link, undefined, 'the merged script read this and always saw undefined');
  assert.equal(actionLinkOf(data), 'https://p.test/auth/v1/verify?token=t');
  assert.equal(actionLinkOf(undefined), undefined);
});

test('evidenceRows returns rows on success and never turns a failed query into zero rows', async () => {
  const table = respond => client(async () => respond()).from('purchases').select('id').eq('user_id', 'u1');
  assert.deepEqual(await evidenceRows(table(() => json(200, []))), []);
  assert.deepEqual(await evidenceRows(table(() => json(200, [{ id: 1 }]))), [{ id: 1 }]);
  const logged = []; const original = console.error; console.error = message => logged.push(String(message));
  try {
    await assert.rejects(evidenceRows(table(() => json(403, { code: '42501', message: 'permission denied for table purchases', details: null, hint: null }))));
    assert.ok(logged.some(line => line.startsWith('EVIDENCE BLOCKED')), 'a missing GRANT must be called out, not hidden');
    assert.ok(!logged.join('\n').includes('purchases'), 'the hint is fixed text and never echoes table names or values');
    await assert.rejects(evidenceRows(table(() => json(500, { message: 'down' }))));
  } finally { console.error = original; }
});

test('only accounts this script created are treated as disposable', () => {
  assert.equal(isMarkedDisposable({ user_metadata: { [DISPOSABLE_MARKER]: true } }), true);
  for (const value of [undefined, null, 'true', 1, false]) assert.equal(isMarkedDisposable({ user_metadata: { [DISPOSABLE_MARKER]: value } }), false);
  assert.equal(isMarkedDisposable({}), false);
  assert.equal(isMarkedDisposable(null), false);
});

/** In-memory Storage tree that behaves like the real listing: folders first, then files, offset/limit. */
function fakeBucket(paths) {
  const objects = new Set(paths);
  const api = {
    async list(prefix, { limit = 100, offset = 0 } = {}) {
      const base = `${prefix}/`, folders = new Set(), files = [];
      for (const path of objects) {
        if (!path.startsWith(base)) continue;
        const rest = path.slice(base.length);
        if (rest.includes('/')) folders.add(rest.split('/')[0]); else files.push(rest);
      }
      const entries = [...[...folders].sort().map(name => ({ name, id: null })), ...files.sort().map(name => ({ name, id: `id-${name}` }))];
      return { data: entries.slice(offset, offset + limit), error: null };
    },
    async remove(files) { assert.ok(Array.isArray(files)); const deleted = files.filter(path => objects.delete(path)); return { data: deleted.map(name => ({ name })), error: null }; },
  };
  return { api, objects };
}

test('purgeStoragePrefix removes everything under one user prefix, however deep or large, and nothing else', async () => {
  const uid = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
  const mine = [`${uid}/probe.pdf`, `${uid}/nested/dir/probe.pdf`, `${uid}/d1/d2/d3/d4/d5/d6/d7/d8/d9/deep.pdf`, ...Array.from({ length: 1010 }, (_, i) => `${uid}/mass/m${i}.pdf`)];
  const theirs = [`${other}/keep.pdf`, `${other}/nested/keep.pdf`];
  const { api, objects } = fakeBucket([...mine, ...theirs]);
  assert.equal(await purgeStoragePrefix(api, uid), mine.length);
  assert.deepEqual([...objects].sort(), theirs.sort(), 'another account must be untouched');
  await assert.rejects(purgeStoragePrefix(api, 'not-a-uuid'), /user id is required/);
  await assert.rejects(purgeStoragePrefix(api, '../'), /user id is required/);
});

test('purgeStoragePrefix terminates on a listing that never empties and honours its budgets', async () => {
  const uid = '11111111-1111-4111-8111-111111111111';
  const phantom = { async list(prefix) { return { data: prefix === uid ? [{ name: 'ghost', id: null }] : [], error: null }; }, async remove() { return { data: [], error: null }; } };
  assert.equal(await purgeStoragePrefix(phantom, uid), 0);
  const { api } = fakeBucket(Array.from({ length: 50 }, (_, i) => `${uid}/f${i}.pdf`));
  await assert.rejects(purgeStoragePrefix(api, uid, { maxObjects: 10, pageSize: 5 }), /budget/);
  await assert.rejects(purgeStoragePrefix({ list: async () => ({ data: null, error: new Error('denied') }), remove: async () => ({}) }, uid), /denied/);
});

test('service keys: real Supabase formats are accepted; anon, publishable, other roles and garbage are not', () => {
  assert.equal(serviceRoleKey(fakeJwt({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role: 'service_role', iat: 1, exp: 2 })), true);
  assert.equal(serviceRoleKey('sb_secret_AbCdEf123456_-xyz'), true);
  assert.equal(serviceRoleKey(fakeJwt({ role: 'service' })), false, 'the value the merged check demanded is not a real Supabase role');
  for (const role of ['anon', 'authenticated', 'supabase_admin', undefined]) assert.equal(serviceRoleKey(fakeJwt({ role })), false);
  for (const value of ['sb_publishable_AbCdEf123456', 'sb_secret_short', 'not-a-jwt', '', undefined, null, 42]) assert.equal(serviceRoleKey(value), false);
});

test('the deletion script can delete exactly one thing: the disposable address, through one guarded helper', async () => {
  const text = await source('verify-deletion-live.mjs');
  assert.equal((text.match(/\.deleteUser\(/g) ?? []).length, 1, 'any additional deleteUser call needs a safety review');
  const helper = /const removeLeftoverDisposable = async \(\) => \{[\s\S]*?\n\};/.exec(text)?.[0] ?? '';
  assert.match(helper, /deleteUser\(existing\.id\)/);
  assert.match(helper, /findUserByEmail\(admin, EMAIL_C\)/, 'the target is looked up by the disposable address only');
  assert.match(helper, /!sameEmail\(EMAIL_C, EMAIL_A\) && !sameEmail\(EMAIL_C, EMAIL_B\)/, 'QA A and B are refused in code');
  assert.match(helper, /isMarkedDisposable\(existing\)/, 'an address this script did not create is refused');
  assert.match(helper, /PROOFPILOT_DELETE_TEST_CONFIRM_RESET/);
  assert.ok(!/findUserByEmail\(admin, EMAIL_[AB]\)[\s\S]{0,80}deleteUser/.test(text), 'QA accounts are looked up for intactness only');
});

test('the live scripts never echo credentials, emails or tokens', async () => {
  for (const file of LIVE_SCRIPTS.filter(name => name !== 'live-helpers.mjs')) {
    const text = await source(file);
    for (const [, argument] of text.matchAll(/console\.(?:log|error)\(([^;]*)\);/g)) {
      assert.ok(!/EMAIL_|PASSWORD|SERVICE_ROLE_KEY|sessionToken|sessionRefresh|\buid[ABC]\b|magicToken|actionLink/.test(argument), `${file}: output must stay value-free: console(${argument.slice(0, 60)}...)`);
    }
  }
});

test('the simulator and its controls stay opt-in: nothing in the release flow imports them', async () => {
  for (const file of await readdir(new URL('.', import.meta.url))) {
    if (!file.endsWith('.mjs') || file.endsWith('.test.mjs')) continue;
    assert.ok(!(await source(file)).includes("./sim/"), `${file} must not depend on the local simulation`);
  }
});
