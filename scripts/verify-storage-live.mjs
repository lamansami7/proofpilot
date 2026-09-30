// P3 storage acceptance: exercises the PRIVATE purchase-documents bucket using only
// NORMAL authenticated sessions (QA A as owner, QA B as adversary, plus an anonymous
// client). Service-role access is never used as RLS evidence. Accounts are untouched;
// only A's own temporary probe objects are created and deleted. Stage names are fixed
// literals, so no token, email, URL or file name can appear in output.
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { stagingConfigured } from './release-config.mjs';
import { loadLocalEnv } from './load-local-env.mjs';
import { liveFailureMessage } from './live-report.mjs';
loadLocalEnv();
const env = process.env;
if (!stagingConfigured(env)) {
  console.error('Not run: storage verification needs the identified staging project, public URL/key, staging opt-in and two dedicated test accounts.');
  process.exit(2);
}
const BUCKET = 'purchase-documents';
const PDF = new TextEncoder().encode('%PDF-1.4\n% ProofPilot storage RLS probe\n');
const make = () => createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const a = make(), b = make(), anon = make();
let stage = 'startup';
let passed = 0;
const pass = name => { passed++; console.log(`PASS ${name}`); };
const bucket = client => client.storage.from(BUCKET);
try {
  stage = 'sign in dedicated test accounts';
  for (const [client, label] of [[a, 'A'], [b, 'B']]) {
    const { error } = await client.auth.signInWithPassword({ email: env[`PROOFPILOT_TEST_EMAIL_${label}`], password: env[`PROOFPILOT_TEST_PASSWORD_${label}`] });
    if (error) throw new Error(`Staging user ${label} could not sign in; check verified email and configuration.`);
  }
  const userA = (await a.auth.getUser()).data.user, userB = (await b.auth.getUser()).data.user;
  assert.ok(userA && userB && userA.id !== userB.id, 'two distinct identities required');
  const pathA = `${userA.id}/proofpilot-rls-probe.pdf`;
  const nestedA = `${userA.id}/nested/dir/proofpilot-rls-probe.pdf`;

  stage = 'remove residue of an earlier interrupted run';
  { const { error } = await bucket(a).remove([pathA, nestedA, `${userA.id}/proofpilot-probe.txt`, `${userA.id}/proofpilot-oversize.png`, `${userA.id}/evil.pdf`]); assert.ifError(error); pass(stage); }

  stage = 'owner uploads into own user-scoped prefix';
  { const { error } = await bucket(a).upload(pathA, PDF, { contentType: 'application/pdf' }); assert.ifError(error); pass(stage); }

  stage = 'owner downloads own file';
  { const { data, error } = await bucket(a).download(pathA); assert.ifError(error);
    assert.equal((await data.arrayBuffer()).byteLength, PDF.byteLength); pass(stage); }

  stage = 'owner creates a signed URL for own file';
  { const { data, error } = await bucket(a).createSignedUrl(pathA, 60); assert.ifError(error); assert.ok(data?.signedUrl); pass(stage); }

  stage = 'other authenticated user cannot download foreign file';
  { const { error } = await bucket(b).download(pathA); assert.ok(error, 'foreign download must fail'); pass(stage); }

  stage = 'other authenticated user cannot create a signed URL for foreign file';
  { const { error } = await bucket(b).createSignedUrl(pathA, 60); assert.ok(error, 'foreign signed URL must fail'); pass(stage); }

  stage = 'anonymous client cannot read the private bucket';
  { const { error } = await bucket(anon).download(pathA); assert.ok(error, 'anonymous download must fail'); pass(stage); }

  stage = 'other authenticated user cannot upload into foreign prefix';
  { const { error } = await bucket(b).upload(`${userA.id}/evil.pdf`, PDF, { contentType: 'application/pdf' }); assert.ok(error, 'foreign upload must fail'); pass(stage); }

  stage = 'uploads cannot target the other user nested prefix';
  { const { error } = await bucket(b).upload(`${userA.id}/nested/evil.pdf`, PDF, { contentType: 'application/pdf' }); assert.ok(error, 'foreign nested upload must fail'); pass(stage); }

  stage = 'user-scoped paths reject the other account id segment';
  { const { error } = await bucket(a).upload(`${userB.id}/probe.pdf`, PDF, { contentType: 'application/pdf' }); assert.ok(error, 'cross-prefix upload must fail'); pass(stage); }

  stage = 'other authenticated user cannot modify foreign file';
  { const { error } = await bucket(b).update(pathA, PDF, { contentType: 'application/pdf' }); assert.ok(error, 'foreign update must fail'); pass(stage); }

  stage = 'other authenticated user cannot upsert-overwrite foreign file';
  { const { error } = await bucket(b).upload(pathA, PDF, { contentType: 'application/pdf', upsert: true }); assert.ok(error, 'foreign upsert must fail'); pass(stage); }

  stage = 'other authenticated user cannot delete foreign file';
  { // Storage reports an RLS-denied delete either as an error or as a 200 that removed nothing; both are denial.
    // The following stage proves the object really survived, so this can never pass vacuously.
    const { data, error } = await bucket(b).remove([pathA]);
    assert.ok(error || (Array.isArray(data) && data.length === 0), 'foreign delete must remove nothing'); pass(stage); }

  stage = 'foreign delete attempts leave the owner object intact';
  { const { data, error } = await bucket(a).list(userA.id); assert.ifError(error);
    assert.ok(data?.some(entry => entry.name === 'proofpilot-rls-probe.pdf'), 'owner object must survive'); pass(stage); }

  stage = 'file type limit rejects disallowed media types';
  { const { error } = await bucket(a).upload(`${userA.id}/proofpilot-probe.txt`, 'plain text probe', { contentType: 'text/plain' });
    assert.ok(error, 'text/plain upload must fail'); pass(stage); }

  stage = 'file size limit rejects uploads over 20 MiB';
  { const oversized = new Uint8Array(20971521);
    const { error } = await bucket(a).upload(`${userA.id}/proofpilot-oversize.png`, oversized, { contentType: 'image/png' });
    assert.ok(error, 'oversize upload must fail'); pass(stage); }

  stage = 'owner uploads, downloads and lists a nested folder object';
  { const { error } = await bucket(a).upload(nestedA, PDF, { contentType: 'application/pdf' }); assert.ifError(error);
    const { data, error: dl } = await bucket(a).download(nestedA); assert.ifError(dl);
    assert.equal((await data.arrayBuffer()).byteLength, PDF.byteLength);
    const { data: entries, error: listErr } = await bucket(a).list(`${userA.id}/nested/dir`);
    assert.ifError(listErr); assert.ok(entries?.some(entry => entry.name === 'proofpilot-rls-probe.pdf')); pass(stage); }

  stage = 'other authenticated user cannot delete foreign nested object';
  { const { data, error } = await bucket(b).remove([nestedA]);
    assert.ok(error || (Array.isArray(data) && data.length === 0), 'foreign nested delete must remove nothing');
    const { error: intact } = await bucket(a).download(nestedA); assert.ifError(intact); // the owner still reads it
    pass(stage); }

  stage = 'owner deletes own files';
  { const { data, error } = await bucket(a).remove([pathA, nestedA]); assert.ifError(error);
    assert.equal(data?.length, 2, 'the owner must be able to delete both probe objects');
    await bucket(a).remove([`${userA.id}/proofpilot-probe.txt`]); // probe never uploaded; residue attempt only
    pass(stage); }

  stage = 'deleted storage objects remain deleted for their owner';
  { const { error } = await bucket(a).download(pathA); assert.ok(error, 'deleted object must not be readable');
    const { data, error: listErr } = await bucket(a).list(userA.id); assert.ifError(listErr);
    assert.ok(!data?.some(entry => entry.name?.startsWith('proofpilot-rls-')), 'deleted probes must be gone'); pass(stage); }

  stage = 'QA accounts remain signed-in and intact';
  { for (const [client, label] of [[a, 'A'], [b, 'B']]) {
      const { data, error } = await client.auth.getUser();
      assert.ifError(error); assert.equal(data.user?.email?.toLowerCase(), env[`PROOFPILOT_TEST_EMAIL_${label}`].trim().toLowerCase(), `QA ${label} must remain intact`);
    }
    await a.auth.signOut({ scope: 'local' }); await b.auth.signOut({ scope: 'local' }); pass(stage); }

  console.log(`Storage RLS checks passed: ${passed} stages with normal authenticated users only (no service-role access). Private bucket, user-scoped paths, cross-user read/modify/delete denial, type/size limits, nested folders and deletion persistence. Not an SMTP/device/full release certification.`);
} catch (error) {
  console.error(liveFailureMessage(stage, error));
  process.exitCode = 1;
} finally {
  // Best-effort residue cleanup for partially completed runs; never touches accounts.
  try { const owner = (await a.auth.getUser()).data.user; if (owner?.id) {
    await bucket(a).remove([`${owner.id}/proofpilot-rls-probe.pdf`, `${owner.id}/nested/dir/proofpilot-rls-probe.pdf`, `${owner.id}/proofpilot-probe.txt`, `${owner.id}/proofpilot-oversize.png`, `${owner.id}/evil.pdf`]);
  } } catch { /* residue is inert metadata the operator can re-run */ }
  try { await a.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
  try { await b.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
}
