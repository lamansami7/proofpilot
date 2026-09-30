// Negative controls for the LOCAL SIMULATION of the deletion matrix.
//
//   node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/sim/run-negative-controls.mjs
//
// A passing matrix only means something if it can FAIL. Each control below deliberately breaks ONE safeguard
// in a temporary copy of the real Edge Function sources (or the migration set) and requires the simulated
// matrix to notice: either the named stage of verify-deletion-live.mjs must fail, or the server-side audit
// of the function's own request trail must flag it. The repository itself is never modified.
//
// !! NOT LIVE EVIDENCE. It shows the scripts have teeth against these faults in a simulator; nothing more.
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = new URL('../../', import.meta.url).pathname;
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7)?.split(',');

const DELETION = 'supabase/functions/_shared/deletion.ts';
const INDEX = 'supabase/functions/delete-account/index.ts';
const strip = path => path.replace(/^supabase\/functions\//, '');
const swap = (first, second) => ({ find: `${first}\n${second}`, replace: `${second}\n${first}` });

const CONTROLS = [
  { id: 'baseline', label: 'unmodified function and migrations (must PASS)', expect: { pass: true } },
  { id: 'strict-grants-baseline', label: 'no default grants anywhere + documented evidence GRANT applied (must PASS)', strictGrants: true,
    sql: 'grant select on public.purchases, public.purchase_tombstones, public.documents to service_role;', expect: { pass: true } },
  { id: 'evidence-grants-missing', label: 'no default grants and evidence GRANT NOT applied: must fail loudly, never read as zero rows', strictGrants: true,
    expect: { stage: 'seed purchase and tombstone rows that the deletion must cascade away', logIncludes: 'EVIDENCE BLOCKED' } },
  // ---- safety rails around WHICH accounts may ever be deleted ----
  { id: 'rail-unmarked-account-refused', label: 'disposable address already exists but this script did not create it: refuse, delete nothing', precreate: 'unmarked',
    expect: { scriptCode: 2, logIncludes: 'Not run: the disposable address already exists but was not created by this script' } },
  { id: 'rail-unmarked-account-confirmed', label: 'same, with explicit PROOFPILOT_DELETE_TEST_CONFIRM_RESET=yes (must PASS)', precreate: 'unmarked', confirmReset: true, expect: { pass: true } },
  { id: 'rail-marked-leftover-reset', label: 'leftover disposable account from an earlier run is reset (must PASS)', precreate: 'marked', expect: { pass: true } },
  { id: 'rail-disposable-is-qa-a', label: 'disposable address equals QA A: refuse before any request', disposableAs: 'qa-a',
    expect: { scriptCode: 2, logIncludes: 'PROOFPILOT_DELETE_TEST_EMAIL/PROOFPILOT_TEST_EMAIL_A' } },
  { id: 'rail-disposable-is-qa-b', label: 'disposable address equals QA B: refuse before any request', disposableAs: 'qa-b',
    expect: { scriptCode: 2, logIncludes: 'PROOFPILOT_DELETE_TEST_EMAIL/PROOFPILOT_TEST_EMAIL_B' } },
  { id: 'old-function', label: 'pre-receipt function behaviour (step-4 fingerprint)', patches: [{ file: DELETION, find: "if (Object.keys(body).length === 1 && 'receipt' in body) {", replace: 'if (false) {' }],
    expect: { stage: 'unknown receipt probes report unknown and never completion' } },
  { id: 'receipts-migration-missing', label: 'function deployed BEFORE migration 202609300001', skipMigrations: ['202609300001_deletion_receipts.sql'],
    expect: { stage: 'unknown receipt probes report unknown and never completion' } },
  { id: 'writes-not-frozen', label: 'account_accepts_writes always true (no freeze, deleted accounts may write)',
    sql: "create or replace function public.account_accepts_writes(owner uuid) returns boolean language sql stable security definer set search_path = '' as $$ select true $$;",
    expect: { stage: 'cloud writes are frozen during cleanup retry' } },
  { id: 'freeze-request-skipped', label: 'begin() never records the deletion request', patches: [{ file: DELETION, find: 'await deps.begin(user.id);', replace: '/* begin skipped */' }],
    expect: { stage: 'failed attempt created the durable deletion request' } },
  { id: 'password-recency-off', label: 'recent-password window not enforced', patches: [{ file: DELETION, find: 'if (age < 0 || age > 300) throw new HttpError(403,\'recent_password_required\');', replace: '/* recency skipped */' }],
    expect: { stage: 'missing password proof is refused without any cloud work' } },
  { id: 'forged-target-accepted', label: 'unknown body keys (forged target) accepted', patches: [{ file: DELETION, find: "|| Object.keys(body).some(key => key !== 'confirmation' && key !== 'receipt')", replace: '|| false' }],
    expect: { stage: 'forged deletion target fields are rejected without cloud work' } },
  { id: 'depth-guard-removed', label: 'storage depth guard removed', patches: [{ file: INDEX, find: 'if (depth > 8)', replace: 'if (depth > 80)' }],
    expect: { stage: 'deletion with a broken storage hierarchy fails without reporting success' } },
  { id: 'cleanup-cap-removed', label: '1,000-object cleanup cap removed', patches: [{ file: INDEX, find: 'while (removed < 1000) {', replace: 'while (removed < 100000) {' }],
    expect: { stage: 'retry with more than 1,000 objects pauses cleanup and keeps auth' } },
  { id: 'storage-cleanup-skipped', label: 'storage cleanup reports success without deleting', patches: [{ file: INDEX, find: 'return clear(userId);', replace: 'return true;' }],
    expect: { stage: 'deletion with a broken storage hierarchy fails without reporting success' } },
  { id: 'auth-deleted-first', label: 'Auth deleted BEFORE storage cleanup', patches: [{ file: DELETION, ...swap("      if (!await deps.removeFiles(user.id)) throw new HttpError(409,'cleanup_pending_retry');", '      await deps.deleteUser(user.id);') }],
    // Deleting Auth first also cascade-removes the deletion-request row, so the request stage fires first;
    // the server-side audit of the function's own request order must ALSO flag it.
    expect: { stage: 'failed attempt created the durable deletion request', audit: 'Auth deletion only ever came AFTER the last storage call' } },
  { id: 'auth-never-deleted', label: 'function answers success without deleting Auth', patches: [{ file: INDEX, find: 'const { error } = await admin.auth.admin.deleteUser(userId); if (error) throw error;', replace: '/* auth deletion skipped */' }],
    expect: { stage: 'auth user is deleted only after cleanup completed' } },
  { id: 'receipt-completed-before-auth', label: 'receipt marked completed BEFORE Auth deletion', patches: [{ file: DELETION, ...swap('      await deps.deleteUser(user.id);\n      // Last write: only a completed Auth deletion may ever set completed_at.', '      if (hash !== null) await deps.receiptCompleted(hash);') }],
    expect: { audit: 'receipt completion only ever came AFTER Auth deletion' } },
  { id: 'receipt-pending-after-destruction', label: 'pending receipt written AFTER destructive work', patches: [{ file: DELETION, ...swap('      if (hash !== null) await deps.receiptPending(hash,user.id);', "      if (!await deps.removeFiles(user.id)) throw new HttpError(409,'cleanup_pending_retry');") }],
    // When cleanup fails before any receipt exists, the status probe answers "unknown" instead of "pending".
    expect: { stage: 'in-progress receipt reports pending, never completed' } },
  { id: 'pending-reads-completed', label: 'pending receipt falsely reported as completed', patches: [{ file: DELETION, find: "{ deleted: row.completedAt !== null, state: row.completedAt !== null ? 'completed' : 'pending', userId: row.userId }", replace: "{ deleted: true, state: 'completed', userId: row.userId }" }],
    expect: { stage: 'in-progress receipt reports pending, never completed' } },
];

const run = async control => {
  const dir = await mkdtemp(join(tmpdir(), 'proofpilot-control-'));
  try {
    const args = ['--experimental-transform-types', '--disable-warning=ExperimentalWarning', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      join(repoRoot, 'scripts/sim/run-live-simulation.mjs'), '--only=deletion', '--fast-clock'];
    if (control.patches) {
      const copy = join(dir, 'functions');
      await cp(join(repoRoot, 'supabase/functions'), copy, { recursive: true });
      for (const patch of control.patches) {
        const file = join(copy, strip(patch.file));
        const text = await readFile(file, 'utf8');
        if (text.split(patch.find).length !== 2) throw new Error(`control ${control.id}: patch target not found exactly once in ${patch.file}`);
        await writeFile(file, text.replace(patch.find, () => patch.replace));
      }
      args.push(`--functions-dir=${copy}`);
    }
    for (const file of control.skipMigrations ?? []) args.push(`--skip-migration=${file}`);
    if (control.strictGrants) args.push('--strict-grants');
    if (control.precreate) args.push(`--precreate-disposable=${control.precreate}`);
    if (control.confirmReset) args.push('--confirm-reset');
    if (control.disposableAs) args.push(`--disposable-email=${control.disposableAs}`);
    if (control.sql) { const sqlFile = join(dir, 'fault.sql'); await writeFile(sqlFile, control.sql); args.push(`--post-migration-sql-file=${sqlFile}`); }
    const child = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: repoRoot, timeout: 240_000 });
    const log = await readFile(join(repoRoot, '.cache/sim/deletion.log'), 'utf8').catch(() => '');
    const report = JSON.parse(await readFile(join(repoRoot, '.cache/sim/audit.json'), 'utf8').catch(() => '{"audit":[],"results":[]}'));
    return { code: child.status, scriptCode: report.results.find(r => r.name === 'deletion')?.code ?? null, failedStage: /FAILED at stage: (.+?) \(/.exec(log)?.[1] ?? null, failedAudits: report.audit.filter(a => !a.ok).map(a => a.name), log };
  } finally { await rm(dir, { recursive: true, force: true }); }
};

console.log('NEGATIVE CONTROLS on the LOCAL SIMULATION (not live evidence)\n');
let bad = 0;
for (const control of CONTROLS.filter(c => !only || only.includes(c.id))) {
  const result = await run(control);
  let caught, detail;
  if (control.expect.pass) { caught = result.code === 0 && result.failedAudits.length === 0; detail = caught ? 'passed as required' : `unexpected failure (exit ${result.code}; stage=${result.failedStage}; audits=${result.failedAudits.join('|')})`; }
  else if (control.expect.scriptCode !== undefined) {
    // A refusal: the script must exit with the refusal code and print the refusal text, and every audit (A/B intact,
    // nothing but the disposable account deleted, an unmarked account untouched) must still hold.
    caught = result.scriptCode === control.expect.scriptCode && result.log.includes(control.expect.logIncludes) && result.failedAudits.length === 0;
    detail = caught ? `refused with exit ${result.scriptCode}; all audits held` : `NOT CAUGHT (script exit ${result.scriptCode}; audits=${result.failedAudits.join('|')})`;
  }
  else if (control.expect.stage) {
    caught = result.code !== 0 && result.failedStage === control.expect.stage
      && (!control.expect.audit || result.failedAudits.some(name => name.includes(control.expect.audit)))
      && (!control.expect.logIncludes || result.log.includes(control.expect.logIncludes));
    detail = caught ? `stage failed: "${result.failedStage}"${control.expect.audit ? `; audit failed: "${control.expect.audit}..."` : ''}` : `NOT CAUGHT (exit ${result.code}; failed stage=${result.failedStage}; audits=${result.failedAudits.join('|')})`;
  }
  else { caught = result.code !== 0 && result.failedAudits.some(name => name.includes(control.expect.audit)); detail = caught ? `audit failed: "${result.failedAudits.find(n => n.includes(control.expect.audit))}"` : `NOT CAUGHT (exit ${result.code}; stage=${result.failedStage}; audits=${result.failedAudits.join('|')})`; }
  if (!caught) bad++;
  console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${control.id.padEnd(34)} ${control.label}\n         -> ${detail}`);
}
console.log(bad ? `\nNEGATIVE CONTROLS: ${bad} fault(s) NOT caught` : '\nNEGATIVE CONTROLS: every injected fault was caught (simulation only).');
process.exit(bad ? 1 : 0);
