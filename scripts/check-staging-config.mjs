// Offline preflight for the destructive staging live test.
// Reports variable NAMES and problem kinds only: it never prints a supplied value,
// so its output is safe to paste into an issue or a chat.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicClientKey, stagingConfigured } from './release-config.mjs';
import { loadLocalEnv } from './load-local-env.mjs';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8; // matches supabase/config.toml minimum_password_length

const present = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * Pure assessment of a staging environment object.
 * Returns `{ ready, problems }`; each problem names a variable and the kind of fault.
 */
export function assessStagingEnv(env) {
  const problems = [];
  const ref = env.PROOFPILOT_STAGING_PROJECT_REF;
  if (!present(ref)) problems.push(['PROOFPILOT_STAGING_PROJECT_REF', 'missing (the 20-character reference of the disposable staging project)']);
  else if (!/^[a-z0-9]{20}$/.test(ref)) problems.push(['PROOFPILOT_STAGING_PROJECT_REF', 'not a 20-character lowercase reference']);

  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  if (!present(url)) problems.push(['EXPO_PUBLIC_SUPABASE_URL', 'missing']);
  else if (present(ref) && /^[a-z0-9]{20}$/.test(ref) && url !== `https://${ref}.supabase.co`) problems.push(['EXPO_PUBLIC_SUPABASE_URL', 'does not equal https://<PROOFPILOT_STAGING_PROJECT_REF>.supabase.co']);

  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!present(key)) problems.push(['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'missing']);
  else if (!publicClientKey(key)) problems.push(['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'not a public anon/publishable key (a privileged key must never be used)']);

  if (env.PROOFPILOT_ALLOW_STAGING_TESTS !== 'yes') problems.push(['PROOFPILOT_ALLOW_STAGING_TESTS', 'must be exactly "yes" to opt in to destructive staging tests']);

  const emailA = env.PROOFPILOT_TEST_EMAIL_A;
  const emailB = env.PROOFPILOT_TEST_EMAIL_B;
  for (const [name, value] of [['PROOFPILOT_TEST_EMAIL_A', emailA], ['PROOFPILOT_TEST_EMAIL_B', emailB]]) {
    if (!present(value)) problems.push([name, 'missing (dedicated test account)']);
    else if (!EMAIL.test(value.trim())) problems.push([name, 'does not look like an email address']);
  }
  for (const [name, password] of [['PROOFPILOT_TEST_PASSWORD_A', env.PROOFPILOT_TEST_PASSWORD_A], ['PROOFPILOT_TEST_PASSWORD_B', env.PROOFPILOT_TEST_PASSWORD_B]]) {
    if (!present(password)) problems.push([name, 'missing']);
    else if (password.length < MIN_PASSWORD) problems.push([name, `shorter than ${MIN_PASSWORD} characters`]);
  }
  if (present(emailA) && present(emailB) && emailA.trim().toLowerCase() === emailB.trim().toLowerCase()) problems.push(['PROOFPILOT_TEST_EMAIL_A/B', 'the isolation test needs two different accounts']);
  if (present(env.PROOFPILOT_TEST_PASSWORD_A) && present(env.PROOFPILOT_TEST_PASSWORD_B)
    && env.PROOFPILOT_TEST_PASSWORD_A === env.PROOFPILOT_TEST_PASSWORD_B) problems.push(['PROOFPILOT_TEST_PASSWORD_A/B', 'the isolation test needs two different credentials']);

  return { ready: problems.length === 0 && stagingConfigured(env), problems };
}

/** Whether a populated local env file would be committed. 'missing' | 'ignored' | 'tracked' | 'not-ignored'. */
export function envFileSafety(filePath = '.env.local', cwd = process.cwd()) {
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git(['ls-files', '--error-unmatch', '--', filePath]);
    return 'tracked';
  } catch { /* not tracked */ }
  if (!existsSync(resolve(cwd, filePath))) return 'missing';
  try {
    return git(['check-ignore', '--', filePath]).trim() ? 'ignored' : 'not-ignored';
  } catch { /* check-ignore exits non-zero when the path is not ignored */ }
  return 'not-ignored';
}

function main() {
  const envFile = process.env.PROOFPILOT_ENV_FILE ?? '.env.local';
  const loaded = loadLocalEnv(envFile);
  const safety = envFileSafety(envFile);
  const { problems } = assessStagingEnv(process.env);
  const findings = [...problems];
  if (loaded && safety === 'not-ignored') findings.unshift([envFile, 'exists but is NOT ignored by git — make sure it is before putting real credentials in it']);
  if (safety === 'tracked') findings.unshift([envFile, 'is tracked by git — remove it from the index and rotate anything it contained']);

  console.log(`Staging window: ${loaded ? `${envFile} loaded (process environment wins; values are never printed)` : `${envFile} not found — using the process environment only`}`);
  if (findings.length) {
    console.error('STAGING NOT READY:');
    for (const [name, detail] of findings) console.error(`- ${name}: ${detail}`);
    console.error('Fix these by name only. Never paste the values into chat, issues or commits.');
    process.exitCode = 1;
    return;
  }
  console.log('Staging configuration ready: reference, URL, public key, opt-in and two distinct test accounts are present.');
  console.log('Next: npm run test:live — destructive only to its own uniquely named QA records on that project.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
