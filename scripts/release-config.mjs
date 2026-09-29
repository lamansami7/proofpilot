// Pure validation. Errors contain names only, never supplied values or secrets.
import { isIP } from 'node:net';

const RESERVED_HOSTS = new Set([
  'example.com', 'example.net', 'example.org',
]);

function reservedHostname(hostname) {
  return RESERVED_HOSTS.has(hostname)
    || /\.(example|invalid|test|localhost|local|internal)$/.test(hostname)
    || hostname.endsWith('.example.com')
    || hostname.endsWith('.example.net')
    || hostname.endsWith('.example.org');
}

export function publicHttps(value) {
  if (typeof value !== 'string' || value !== value.trim() || !value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && hostname.includes('.') && !isIP(hostname)
      && !reservedHostname(hostname);
  } catch { return false; }
}

export function publicSupportEmail(value) {
  if (typeof value !== 'string' || value !== value.trim()) return false;
  const match = /^([^\s@<>]+)@([^\s@<>]+)$/.exec(value);
  if (!match) return false;
  const [local, rawDomain] = match.slice(1);
  const domain = rawDomain.toLowerCase();
  const labels = domain.split('.');
  const localValid = local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..');
  const domainValid = domain.length <= 253 && labels.length >= 2
    && labels.every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
  return localValid && domainValid && !reservedHostname(domain);
}

export function validSupabaseUrl(value) {
  if (!publicHttps(value)) return false;
  try {
    const url = new URL(value);
    return url.pathname === '/' && !url.port
      && /^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname);
  } catch { return false; }
}

export function validAiEndpoint(value, supabaseUrl) {
  if (!publicHttps(value) || !validSupabaseUrl(supabaseUrl)) return false;
  try {
    const endpoint = new URL(value);
    const project = new URL(supabaseUrl);
    return endpoint.origin === project.origin
      && (endpoint.pathname === '/functions/v1/proofpilot-ai' || endpoint.pathname === '/functions/v1/proofpilot-ai/');
  } catch { return false; }
}

export function publicClientKey(value) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value ?? '')) return true;
  try {
    const parts = value.split('.');
    return parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'anon';
  } catch { return false; }
}

export function releaseFailures(app, env) {
  const failures = [];
  if (!validSupabaseUrl(env.EXPO_PUBLIC_SUPABASE_URL)) failures.push('Configure EXPO_PUBLIC_SUPABASE_URL as a standard HTTPS Supabase project origin');
  if (!publicHttps(env.EXPO_PUBLIC_PRIVACY_POLICY_URL)) failures.push('Configure a public HTTPS URL without credentials/query/fragment: EXPO_PUBLIC_PRIVACY_POLICY_URL');
  // publicHttps() rejects non-HTTPS schemes, embedded credentials, query strings,
  // fragments, whitespace, IP literals, single-label hosts and reserved/example domains. Names only:
  // never echo values or secrets.
  if (!publicHttps(env.EXPO_PUBLIC_AUTH_REDIRECT_URL)) failures.push('Configure a public HTTPS EXPO_PUBLIC_AUTH_REDIRECT_URL without credentials/query/fragment; it must match a Supabase allowed redirect URL and must never be localhost');
  if (!publicClientKey(env.EXPO_PUBLIC_SUPABASE_ANON_KEY)) failures.push('Configure EXPO_PUBLIC_SUPABASE_ANON_KEY with a public anon/publishable key, never a privileged key');
  if (!publicSupportEmail(env.EXPO_PUBLIC_SUPPORT_EMAIL)) failures.push('Configure a real private EXPO_PUBLIC_SUPPORT_EMAIL');
  // AI is intentionally optional: a blank endpoint means "AI disabled" and is valid.
  // A configured endpoint must be a safe public HTTPS URL, so "AI enabled" can never
  // resolve to an unsafe or credential-bearing endpoint.
  if (env.EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT && !validAiEndpoint(env.EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT, env.EXPO_PUBLIC_SUPABASE_URL)) failures.push('Configure EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT as the proofpilot-ai function on the configured Supabase project, or leave AI disabled');
  if (env.EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED !== 'true') failures.push('Deploy and verify deletion service before enabling EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED');

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(app.extra?.eas?.projectId ?? '')
    || !/^[a-z0-9][a-z0-9-]{1,62}$/i.test(app.owner ?? '')) failures.push('Configure an EAS project ID and owner; verify project ownership with authenticated EAS tooling');
  if (app.scheme !== 'proofpilot') failures.push('Native authentication requires the proofpilot://auth/callback scheme');
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(app.slug ?? '')
    || !/^(?:[A-Za-z][A-Za-z0-9_-]*\.)+[A-Za-z][A-Za-z0-9_-]*$/.test(app.ios?.bundleIdentifier ?? '')
    || app.android?.package !== app.ios?.bundleIdentifier) failures.push('Set a valid app slug and matching Android/iOS reverse-DNS identifiers');
  if (!/^(?!0\.0\.0$)(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(app.version ?? '')) failures.push('Set a stable public semantic app version (major.minor.patch)');
  if (!Number.isInteger(app.android?.versionCode) || app.android.versionCode < 1 || app.android.versionCode > 2_100_000_000
    || !/^[1-9]\d*(\.\d+){0,2}$/.test(app.ios?.buildNumber ?? '')) failures.push('Set valid native build identifiers');
  for (const name of ['LIVE', 'DEVICE', 'LEGAL']) if (env[`PROOFPILOT_${name}_VERIFICATION_APPROVED`] !== 'yes') failures.push(`Complete ${name.toLowerCase()} review and record PROOFPILOT_${name}_VERIFICATION_APPROVED=yes`);
  return failures;
}

export function stagingConfigured(env) {
  const ref = env.PROOFPILOT_STAGING_PROJECT_REF;
  return /^[a-z0-9]{20}$/.test(ref ?? '')
    && env.EXPO_PUBLIC_SUPABASE_URL === `https://${ref}.supabase.co`
    && publicClientKey(env.EXPO_PUBLIC_SUPABASE_ANON_KEY)
    && env.PROOFPILOT_ALLOW_STAGING_TESTS === 'yes'
    && ['EMAIL_A', 'PASSWORD_A', 'EMAIL_B', 'PASSWORD_B'].every(key => Boolean(env[`PROOFPILOT_TEST_${key}`]));
}
