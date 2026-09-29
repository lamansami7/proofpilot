import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RULES, scanBuild, scanText } from './scan-client-secrets.mjs';

test('detects privileged material from every rule without echoing the value', () => {
  const jwt = (payload) => `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.c2lnbmF0dXJl`;
  const samples = {
    'supabase-secret-key': 'sb_secret_abcdefghijklmnop',
    'service-role-jwt': jwt({ role: 'service_role', iss: 'supabase' }),
    'service-role-env-name': 'process.env.SUPABASE_SERVICE_ROLE_KEY',
    'provider-key-name': 'Deno.env.get("OPENAI_API_KEY")',
    'provider-host': 'https://api.openai.com/v1/chat/completions',
    'provider-key-value': `Bearer sk-proj-${'a'.repeat(32)}`,
    'private-key-block': '-----BEGIN PRIVATE KEY-----',
  };
  for (const rule of RULES) {
    assert.ok(samples[rule.name], `missing sample for ${rule.name}`);
    assert.ok(scanText(samples[rule.name]).includes(rule.name), rule.name);
  }
  assert.equal(RULES.length, Object.keys(samples).length, 'every rule needs a sample');
  // A public anon token is the expected client key and must not be reported.
  assert.ok(!scanText(jwt({ role: 'anon' })).includes('service-role-jwt'));
});

test('a public client build and ordinary product strings are not false positives', () => {
  const clean = [
    'apikey: "sb_publishable_fixture"',
    'Keychain, Android Keystore and Web Locks',
    'sign in with your password to delete your account',
    'https://verify.example.test/functions/v1/delete-account',
  ].join('\n');
  assert.deepEqual(scanText(clean), []);
});

test('scans nested artifacts, skips binaries, and reports file plus rule only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proofpilot-client-scan-'));
  try {
    await mkdir(join(root, 'assets'), { recursive: true });
    await writeFile(join(root, 'app.js'), 'const k="sb_secret_abcdefghijklmnop";');
    await writeFile(join(root, 'assets', 'clean.json'), '{"key":"sb_publishable_fixture"}');
    await writeFile(join(root, 'assets', 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x73, 0x6b, 0x2d]));
    const findings = await scanBuild(root);
    assert.deepEqual(findings, [{ file: 'app.js', rule: 'supabase-secret-key' }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('command exits non-zero on a leak and on a missing build, without printing the secret', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proofpilot-client-cli-'));
  const secret = 'sb_secret_leakedvalue12345';
  try {
    await writeFile(join(root, 'bundle.js'), `x=${secret}`);
    const leaked = spawnSync(process.execPath, [new URL('./scan-client-secrets.mjs', import.meta.url).pathname, root], { encoding: 'utf8' });
    assert.equal(leaked.status, 1);
    assert.match(leaked.stderr, /supabase-secret-key/);
    assert.ok(!leaked.stdout.includes(secret) && !leaked.stderr.includes(secret), 'the matched value must never be printed');
    const missing = spawnSync(process.execPath, [new URL('./scan-client-secrets.mjs', import.meta.url).pathname, join(root, 'absent')], { encoding: 'utf8' });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /build:web/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
