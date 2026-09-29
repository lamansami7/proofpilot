import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { publicHttps, publicSupportEmail, publicClientKey, validAiEndpoint, validSupabaseUrl, releaseFailures, stagingConfigured } from './release-config.mjs';
test('empty release config fails closed without printing values',()=>{
 const failures=releaseFailures({},{});assert.ok(failures.length>=9);
 assert.ok(!releaseFailures({}, {EXPO_PUBLIC_SUPABASE_ANON_KEY:'private-value'}).join().includes('private-value'));
});
for (const url of ['http://example.com','https://secret@example.com','https://example.com?key=private','https://localhost','https://placeholder.invalid']) test(`rejects unsafe URL ${url}`,()=>assert.equal(publicHttps(url),false));
test('recognizes public key type, rejects privileged keys',()=>{
 const jwt=role=>`header.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;
 assert.equal(publicClientKey(jwt('anon')),true);
 assert.equal(publicClientKey(jwt('service_role')),false);
 assert.equal(publicClientKey('sb_secret_not-a-real-key'),false);
});
test('staging identification must match URL exactly before any network activity',()=>{
 const env={PROOFPILOT_STAGING_PROJECT_REF:'a'.repeat(20),EXPO_PUBLIC_SUPABASE_URL:`https://${'a'.repeat(20)}.supabase.co`,EXPO_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_fixture',PROOFPILOT_ALLOW_STAGING_TESTS:'yes',PROOFPILOT_TEST_EMAIL_A:'a',PROOFPILOT_TEST_PASSWORD_A:'a',PROOFPILOT_TEST_EMAIL_B:'b',PROOFPILOT_TEST_PASSWORD_B:'b'};
 assert.equal(stagingConfigured(env),true);
 assert.equal(stagingConfigured({...env,PROOFPILOT_STAGING_PROJECT_REF:'b'.repeat(20)}),false);
 assert.equal(stagingConfigured({...env,PROOFPILOT_ALLOW_STAGING_TESTS:''}),false);
});
test('invalid native identifiers and EAS placeholder never pass',()=>{
 const failures=releaseFailures({version:'1.0.0',extra:{eas:{projectId:'placeholder'}},android:{versionCode:-1},ios:{buildNumber:'no'}},{});
 assert.ok(failures.some(v=>v.includes('EAS')));assert.ok(failures.some(v=>v.includes('native build')));
});

// Audit blocker 1: the production auth redirect must be gated exactly like every
// other public URL, otherwise a localhost or credential-bearing value ships silently.
const REDIRECT_UNSAFE = [
  'http://get-proofpilot.lovable.app',        // not HTTPS
  'https://user:pass@get-proofpilot.lovable.app', // embedded credentials
  'https://get-proofpilot.lovable.app?next=/x',   // query string
  'https://get-proofpilot.lovable.app#frag',      // fragment
  'https://localhost:3000',                   // loopback
  'https://127.0.0.1',
  'https://[::1]',
  'https://get-proofpilot.localhost',
  'https://placeholder.invalid',
  'javascript:alert(1)',                      // unsafe protocol
  'proofpilot://auth/callback',               // native scheme is not a web redirect
  '',
];
for (const value of REDIRECT_UNSAFE) {
  test(`rejects unsafe EXPO_PUBLIC_AUTH_REDIRECT_URL: ${JSON.stringify(value)}`, () => {
    const failures = releaseFailures({ version: '1.0.0', extra: { eas: { projectId: 'placeholder' } }, android: { versionCode: 1 }, ios: { buildNumber: '1' } }, { EXPO_PUBLIC_AUTH_REDIRECT_URL: value });
    assert.ok(failures.some(v => v.includes('EXPO_PUBLIC_AUTH_REDIRECT_URL')), `expected a failure for ${JSON.stringify(value)}`);
  });
}
test('accepts the production auth redirect and never echoes its value in failures', () => {
  const base = { EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fixture', EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://get-proofpilot.lovable.app/privacy', EXPO_PUBLIC_SUPPORT_EMAIL: 'support@proofpilot.app', EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED: 'true', EXPO_PUBLIC_AUTH_REDIRECT_URL: 'https://get-proofpilot.lovable.app' };
  const app = { name: 'ProofPilot', slug: 'proofpilot', owner: 'lamansami7', scheme: 'proofpilot', version: '1.0.0', extra: { eas: { projectId: '35a5ac4e-462a-46f9-85a7-087ffffdb41f' } }, android: { package: 'com.proofpilot.app', versionCode: 1 }, ios: { bundleIdentifier: 'com.proofpilot.app', buildNumber: '1' } };
  // Only the three human review approvals remain outstanding.
  const failures = releaseFailures(app, base);
  assert.equal(failures.length, 3, failures.join(' | '));
  assert.ok(!failures.some(v => v.includes('get-proofpilot')), 'failures must not echo configured values');
  assert.ok(!failures.some(v => v.includes('sb_publishable')), 'failures must not echo the anon key');
  // A secret smuggled into the redirect is rejected and not printed back.
  const secret = releaseFailures(app, { ...base, EXPO_PUBLIC_AUTH_REDIRECT_URL: 'https://user:supasecretvalue@get-proofpilot.lovable.app' });
  assert.ok(secret.some(v => v.includes('EXPO_PUBLIC_AUTH_REDIRECT_URL')));
  assert.ok(!secret.join().includes('supasecretvalue'), 'credentials must never appear in output');
});

// AI is optional by design: disabled must stay valid, enabled must be safe.
test('AI is optional, but an enabled endpoint must be the configured project function', () => {
  const app = { name: 'ProofPilot', slug: 'proofpilot', owner: 'lamansami7', scheme: 'proofpilot', version: '1.0.0', extra: { eas: { projectId: '35a5ac4e-462a-46f9-85a7-087ffffdb41f' } }, android: { package: 'com.proofpilot.app', versionCode: 1 }, ios: { bundleIdentifier: 'com.proofpilot.app', buildNumber: '1' } };
  const base = { EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fixture', EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://get-proofpilot.lovable.app/privacy', EXPO_PUBLIC_SUPPORT_EMAIL: 'support@proofpilot.app', EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED: 'true', EXPO_PUBLIC_AUTH_REDIRECT_URL: 'https://get-proofpilot.lovable.app' };
  assert.equal(releaseFailures(app, base).length, 3, 'AI intentionally disabled must not be a release failure');
  assert.equal(releaseFailures(app, { ...base, EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT: 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/proofpilot-ai' }).length, 3);
  for (const unsafe of ['http://ai.example.com', 'https://localhost:9000/ai', 'https://key@example.com/ai', 'https://other-project.supabase.co/functions/v1/proofpilot-ai', 'https://abcdefghijklmnopqrst.supabase.co/other-function'])
    assert.ok(releaseFailures(app, { ...base, EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT: unsafe }).some(v => v.includes('AI_ENDPOINT')), unsafe);
});

test('Supabase URLs are standard project origins and AI endpoints cannot send context elsewhere', () => {
  const project = 'https://abcdefghijklmnopqrst.supabase.co';
  assert.equal(validSupabaseUrl(project), true);
  for (const unsafe of ['https://example.com', 'https://abcdefghijklmnopqrst.supabase.co/custom', 'https://abcdefghijklmnopqrst.supabase.co:8443', 'http://abcdefghijklmnopqrst.supabase.co', 'https://short.supabase.co']) {
    assert.equal(validSupabaseUrl(unsafe), false, unsafe);
  }
  assert.equal(validAiEndpoint(`${project}/functions/v1/proofpilot-ai`, project), true);
  assert.equal(validAiEndpoint(`${project}/functions/v1/proofpilot-ai/`, project), true);
  assert.equal(validAiEndpoint('https://other-project.supabase.co/functions/v1/proofpilot-ai', project), false);
  assert.equal(validAiEndpoint(`${project}/functions/v1/other-function`, project), false);
});

test('rejects reserved example domains, IP literals, single-label hosts, and whitespace', () => {
  for (const url of ['https://example.com/privacy', 'https://sub.example.org', ' https://proofpilot.app ', 'https://192.168.1.1', 'https://10.0.0.8', 'https://172.16.2.3', 'https://[fd00::1]', 'https://com']) {
    assert.equal(publicHttps(url), false, url);
  }
  for (const email of ['support@example.com', 'owner@example.org', 'support@service.invalid', ' support@proofpilot.app', 'support@foo..bar', 'support@-invalid.test']) {
    assert.equal(publicSupportEmail(email), false, email);
  }
  assert.equal(publicSupportEmail('private-help@proofpilot.app'), true);
});

test('release config requires the native callback scheme and matching platform identifiers', () => {
  const app = { name: 'ProofPilot', slug: 'proofpilot', owner: 'lamansami7', scheme: 'proofpilot', version: '1.0.0', extra: { eas: { projectId: '35a5ac4e-462a-46f9-85a7-087ffffdb41f' } }, android: { package: 'com.proofpilot.app', versionCode: 1 }, ios: { bundleIdentifier: 'com.proofpilot.app', buildNumber: '1' } };
  const env = { EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fixture', EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://get-proofpilot.lovable.app/privacy', EXPO_PUBLIC_SUPPORT_EMAIL: 'support@proofpilot.app', EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED: 'true', EXPO_PUBLIC_AUTH_REDIRECT_URL: 'https://get-proofpilot.lovable.app', PROOFPILOT_LIVE_VERIFICATION_APPROVED: 'yes', PROOFPILOT_DEVICE_VERIFICATION_APPROVED: 'yes', PROOFPILOT_LEGAL_VERIFICATION_APPROVED: 'yes' };
  assert.deepEqual(releaseFailures(app, env), []);
  assert.ok(releaseFailures({ ...app, scheme: 'other' }, env).some(message => message.includes('scheme')));
  assert.ok(releaseFailures({ ...app, android: { ...app.android, package: 'com.other.app' } }, env).some(message => message.includes('identifiers')));
  assert.ok(releaseFailures({ ...app, ios: { ...app.ios, bundleIdentifier: 'com.other.app' } }, env).some(message => message.includes('identifiers')));
});

test('release config rejects placeholder project ownership and invalid shipping versions', () => {
  const app = { name: 'ProofPilot', slug: 'proofpilot', owner: 'owner', scheme: 'proofpilot', version: '1.0.0', extra: { eas: { projectId: '35a5ac4e-462a-46f9-85a7-087ffffdb41f' } }, android: { package: 'com.proofpilot.app', versionCode: 1 }, ios: { bundleIdentifier: 'com.proofpilot.app', buildNumber: '1' } };
  const env = { EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fixture', EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://get-proofpilot.lovable.app/privacy', EXPO_PUBLIC_SUPPORT_EMAIL: 'support@proofpilot.app', EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED: 'true', EXPO_PUBLIC_AUTH_REDIRECT_URL: 'https://get-proofpilot.lovable.app', PROOFPILOT_LIVE_VERIFICATION_APPROVED: 'yes', PROOFPILOT_DEVICE_VERIFICATION_APPROVED: 'yes', PROOFPILOT_LEGAL_VERIFICATION_APPROVED: 'yes' };
  assert.deepEqual(releaseFailures(app, env), []);
  assert.ok(releaseFailures({ ...app, owner: '' }, env).some(message => message.includes('EAS')));
  assert.ok(releaseFailures({ ...app, version: '0.0.0' }, env).some(message => message.includes('version')));
  assert.ok(releaseFailures({ ...app, version: 'v1.0' }, env).some(message => message.includes('version')));
  assert.ok(releaseFailures({ ...app, android: { ...app.android, versionCode: 2_100_000_001 } }, env).some(message => message.includes('build identifiers')));
});

test('live verification safely loads optional ignored .env.local values without overriding process env', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'proofpilot-env-test-'));
  try {
    const file = join(dir, '.env.local');
    const fromFile = 'PROOFPILOT_FIXTURE_FROM_LOCAL_FILE';
    const existing = 'PROOFPILOT_FIXTURE_FROM_PROCESS';
    await writeFile(file, `${fromFile}=local-value\n${existing}=file-value\n`, { mode: 0o600 });
    const childEnv = { ...process.env, [existing]: 'process-value' };
    delete childEnv[fromFile];
    const script = `import { loadLocalEnv } from ${JSON.stringify(new URL('./load-local-env.mjs', import.meta.url).href)};\nconst loaded = loadLocalEnv(${JSON.stringify(file)});\nconsole.log(JSON.stringify({ loaded, fromFile: process.env[${JSON.stringify(fromFile)}], existing: process.env[${JSON.stringify(existing)}] }));`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: childEnv, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { loaded: true, fromFile: 'local-value', existing: 'process-value' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
