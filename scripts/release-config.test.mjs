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
