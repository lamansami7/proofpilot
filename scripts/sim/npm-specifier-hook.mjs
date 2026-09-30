// Node module-resolution hook: lets Node import the UNMODIFIED Deno Edge Function sources.
// Deno imports `npm:@supabase/supabase-js@2.117.1`; Node needs the bare package name, resolved from
// the repository's own node_modules (the lockfile pins the same 2.117.1 version).
import { fileURLToPath, pathToFileURL } from 'node:url';
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const anchor = pathToFileURL(`${repoRoot}package.json`).href;
export async function resolve(specifier, context, nextResolve) {
  const match = /^npm:(@[^/@]+\/[^/@]+|[^/@]+)(?:@[^/]+)?(\/.*)?$/.exec(specifier);
  if (match) return nextResolve(match[1] + (match[2] ?? ''), { ...context, parentURL: anchor });
  return nextResolve(specifier, context);
}
