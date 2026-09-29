import test from 'node:test';
import assert from 'node:assert/strict';
import { publicHttps, publicClientKey, releaseFailures, stagingConfigured } from './release-config.mjs';
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
  const base = { EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fixture', EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://get-proofpilot.lovable.app/privacy', EXPO_PUBLIC_SUPPORT_EMAIL: 'support@example.com', EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED: 'true', EXPO_PUBLIC_AUTH_REDIRECT_URL: 'https://get-proofpilot.lovable.app' };
  const app = { version: '1.0.0', extra: { eas: { projectId: '35a5ac4e-462a-46f9-85a7-087ffffdb41f' } }, android: { versionCode: 1 }, ios: { buildNumber: '1' } };
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
test('AI endpoint may be blank, but an enabled AI endpoint must be public HTTPS', () => {
  const app = { version: '1.0.0', extra: { eas: { projectId: '35a5ac4e-462a-46f9-85a7-087ffffdb41f' } }, android: { versionCode: 1 }, ios: { buildNumber: '1' } };
  const base = { EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fixture', EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://get-proofpilot.lovable.app/privacy', EXPO_PUBLIC_SUPPORT_EMAIL: 'support@example.com', EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED: 'true', EXPO_PUBLIC_AUTH_REDIRECT_URL: 'https://get-proofpilot.lovable.app' };
  assert.equal(releaseFailures(app, base).length, 3, 'AI intentionally disabled must not be a release failure');
  assert.equal(releaseFailures(app, { ...base, EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT: 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/proofpilot-ai' }).length, 3);
  for (const unsafe of ['http://ai.example.com', 'https://localhost:9000/ai', 'https://key@example.com/ai'])
    assert.ok(releaseFailures(app, { ...base, EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT: unsafe }).some(v => v.includes('AI_ENDPOINT')), unsafe);
});
