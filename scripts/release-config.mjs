// Pure validation. Errors contain names only, never supplied values or secrets.
export function publicHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)
      && !/\.(invalid|test|localhost)$/.test(url.hostname);
  } catch { return false; }
}
export function publicClientKey(value) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value ?? '')) return true;
  try {
    const parts = value.split('.');
    return parts.length === 3 && JSON.parse(Buffer.from(parts[1],'base64url').toString()).role === 'anon';
  } catch { return false; }
}
export function releaseFailures(app, env) {
  const failures = [];
  for (const name of ['EXPO_PUBLIC_SUPABASE_URL','EXPO_PUBLIC_PRIVACY_POLICY_URL']) {
    if (!publicHttps(env[name])) failures.push(`Configure a public HTTPS URL without credentials/query/fragment: ${name}`);
  }
  // publicHttps() rejects non-HTTPS schemes, embedded credentials, query strings,
  // fragments, localhost/IP literals and reserved TLDs. Names only: never echo values.
  if (!publicHttps(env.EXPO_PUBLIC_AUTH_REDIRECT_URL)) failures.push('Configure a public HTTPS EXPO_PUBLIC_AUTH_REDIRECT_URL without credentials/query/fragment; it must match a Supabase allowed redirect URL and must never be localhost');
  if (!publicClientKey(env.EXPO_PUBLIC_SUPABASE_ANON_KEY)) failures.push('Configure EXPO_PUBLIC_SUPABASE_ANON_KEY with a public anon/publishable key, never a privileged key');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '') || /\.(invalid|test)$/i.test(env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '')) failures.push('Configure a real private EXPO_PUBLIC_SUPPORT_EMAIL');
  // AI is intentionally optional: a blank endpoint means "AI disabled" and is valid.
  // A configured endpoint must be a safe public HTTPS URL, so "AI enabled" can never
  // resolve to an unsafe or credential-bearing endpoint.
  if (env.EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT && !publicHttps(env.EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT)) failures.push('Configure a safe EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT or leave AI disabled');
  if (env.EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED !== 'true') failures.push('Deploy and verify deletion service before enabling EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(app.extra?.eas?.projectId ?? '')) failures.push('Run authenticated eas init for your actual EAS project');
  if (app.version !== '1.0.0') failures.push('Public version must remain 1.0.0');
  if (!Number.isInteger(app.android?.versionCode) || app.android.versionCode < 1 || !/^[1-9]\d*(\.\d+){0,2}$/.test(app.ios?.buildNumber ?? '')) failures.push('Set valid native build identifiers');
  for (const name of ['LIVE','DEVICE','LEGAL']) if (env[`PROOFPILOT_${name}_VERIFICATION_APPROVED`] !== 'yes') failures.push(`Complete ${name.toLowerCase()} review and record PROOFPILOT_${name}_VERIFICATION_APPROVED=yes`);
  return failures;
}
export function stagingConfigured(env) {
  const ref = env.PROOFPILOT_STAGING_PROJECT_REF;
  return /^[a-z0-9]{20}$/.test(ref ?? '')
    && env.EXPO_PUBLIC_SUPABASE_URL === `https://${ref}.supabase.co`
    && publicClientKey(env.EXPO_PUBLIC_SUPABASE_ANON_KEY)
    && env.PROOFPILOT_ALLOW_STAGING_TESTS === 'yes'
    && ['EMAIL_A','PASSWORD_A','EMAIL_B','PASSWORD_B'].every(key => Boolean(env[`PROOFPILOT_TEST_${key}`]));
}
