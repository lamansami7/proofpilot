// Fails closed when a privileged key or provider secret reaches a shipped client artifact.
// Only file paths and rule names are printed, never the matched value, so a leak found in
// CI logs cannot be copied out of the log.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** A leaked privileged token is recognized by its own payload, not by a keyword. */
function hasPrivilegedJwt(text) {
  for (const token of text.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g) ?? []) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      if (payload?.role === 'service_role' || payload?.role === 'supabase_admin') return true;
    } catch { /* not a readable JWT payload */ }
  }
  return false;
}

/** Names and shapes that must never appear in a client bundle. Order = report order. */
export const RULES = [
  { name: 'supabase-secret-key', test: /sb_secret_[A-Za-z0-9_-]{8,}/ },
  { name: 'service-role-jwt', test: hasPrivilegedJwt },
  { name: 'service-role-env-name', test: /SUPABASE_SERVICE_ROLE(_KEY)?|SERVICE_ROLE_KEY|SUPABASE_SECRET(_KEY)?|service_role/ },
  { name: 'provider-key-name', test: /OPENAI_API_KEY/ },
  { name: 'provider-host', test: /api\.openai\.com/ },
  { name: 'provider-key-value', test: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/ },
  { name: 'private-key-block', test: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

/** Rule names matched by a decoded text artifact. Exported for tests. */
export function scanText(text) {
  return RULES.filter(rule => (typeof rule.test === 'function' ? rule.test(text) : rule.test.test(text))).map(rule => rule.name);
}

/** Text-like artifacts only: binary files are skipped by a NUL-byte sniff, not by extension. */
function looksBinary(bytes) {
  const limit = Math.min(bytes.length, 8192);
  for (let index = 0; index < limit; index++) if (bytes[index] === 0) return true;
  return false;
}

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

/** Scans every text artifact under `root`. Returns one `{ file, rule }` entry per finding. */
export async function scanBuild(root) {
  const findings = [];
  for await (const path of walk(root)) {
    const bytes = await readFile(path);
    if (looksBinary(bytes)) continue;
    for (const rule of scanText(bytes.toString('utf8'))) findings.push({ file: relative(root, path), rule });
  }
  return findings;
}

async function main() {
  const root = resolve(process.argv[2] ?? 'dist');
  let findings;
  try {
    findings = await scanBuild(root);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.error(`No client build found at ${root}. Run "npm run build:web" before this check.`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  if (findings.length) {
    console.error('PRIVILEGED MATERIAL IN CLIENT BUILD:');
    // Report the rule and file only. The matched value is never echoed.
    for (const finding of findings) console.error(`- ${finding.rule} in ${finding.file}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Client artifact scan passed: ${RULES.length} rules checked, no privileged key or provider secret in ${relative(process.cwd(), root) || '.'}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
