// Runs the three live-verification scripts (steps 6-8 of the rollout) against the LOCAL SIMULATION.
//
//   node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/sim/run-live-simulation.mjs
//   options: --only=live,storage,deletion   --fast-clock   --skip-migration=<file>   --functions-dir=<dir>
//
// !! NOT LIVE EVIDENCE. A pass here means "the scripts, the real Edge Function source and the real migration
// !! SQL agree with each other under an emulated Auth/Storage/PostgREST". It never replaces `npm run test:live*`
// !! against the hosted staging project. Output and exit codes are value-free (no keys, passwords or emails).
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { startSupabaseSim } from './supabase-sim.mjs';

const args = process.argv.slice(2);
const flag = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const only = (flag('only') ?? 'live,storage,deletion').split(',');
const fastClock = args.includes('--fast-clock');
const strictGrants = args.includes('--strict-grants');
const precreate = flag('precreate-disposable'); // marked | unmarked: a same-address account that exists before the run
const confirmReset = args.includes('--confirm-reset');
const disposableAs = flag('disposable-email');  // qa-a | qa-b: safety-rail control (the disposable address equals a QA address)
const skipMigrations = args.filter(a => a.startsWith('--skip-migration=')).map(a => a.slice('--skip-migration='.length));
const functionsDir = flag('functions-dir');
const postSqlFile = flag('post-migration-sql-file');
const repoRoot = new URL('../../', import.meta.url).pathname;
const logDir = join(repoRoot, '.cache', 'sim');
await mkdir(logDir, { recursive: true });

const ref = 'sim00000000000000000';
const secret = () => crypto.randomBytes(18).toString('base64url');
const accounts = {
  A: { email: 'qa-a@proofpilot-sim.test', password: secret() },
  B: { email: 'qa-b@proofpilot-sim.test', password: secret() },
  C: { email: 'qa-disposable@proofpilot-sim.test', password: secret() },
};

const postMigrationSql = postSqlFile ? await readFile(postSqlFile, 'utf8') : '';
const sim = await startSupabaseSim({ publicHost: `${ref}.supabase.co`, clockAdvance: fastClock, skipMigrations, postMigrationSql, strictGrants, ...(functionsDir ? { functionsDir } : {}) });
const userA = await sim.createUser(accounts.A.email, accounts.A.password);
const userB = await sim.createUser(accounts.B.email, accounts.B.password);
sim.protect(userA.id); sim.protect(userB.id);
if (precreate) await sim.createUser(accounts.C.email, accounts.C.password, precreate === 'marked' ? { proofpilot_qa_disposable: true } : { note: 'a real account that this script did not create' });
if (disposableAs === 'qa-a') accounts.C.email = accounts.A.email;
if (disposableAs === 'qa-b') accounts.C.email = accounts.B.email;

const childEnv = {
  PATH: process.env.PATH, HOME: process.env.HOME,
  SIM_PUBLIC_HOST: sim.publicHost, SIM_ORIGIN: sim.origin, SIM_CLOCK_ADVANCE: fastClock ? '1' : '0',
  PROOFPILOT_STAGING_PROJECT_REF: ref,
  EXPO_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: sim.keys.anon,
  PROOFPILOT_ALLOW_STAGING_TESTS: 'yes',
  PROOFPILOT_TEST_EMAIL_A: accounts.A.email, PROOFPILOT_TEST_PASSWORD_A: accounts.A.password,
  PROOFPILOT_TEST_EMAIL_B: accounts.B.email, PROOFPILOT_TEST_PASSWORD_B: accounts.B.password,
  PROOFPILOT_DELETE_TEST_EMAIL: accounts.C.email, PROOFPILOT_DELETE_TEST_PASSWORD: accounts.C.password,
  PROOFPILOT_SERVICE_ROLE_KEY: sim.keys.operator,
  ...(confirmReset ? { PROOFPILOT_DELETE_TEST_CONFIRM_RESET: 'yes' } : {}),
};

const SCRIPTS = { live: 'verify-live.mjs', storage: 'verify-storage-live.mjs', deletion: 'verify-deletion-live.mjs' };
const results = [];
async function run(name) {
  const file = join(repoRoot, 'scripts', SCRIPTS[name]);
  const started = Date.now();
  const child = spawn(process.execPath, ['--import', join(repoRoot, 'scripts/sim/fetch-redirect.mjs'), file], { env: childEnv, cwd: repoRoot });
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  const code = await new Promise(resolve => child.on('close', resolve));
  await writeFile(join(logDir, `${name}.log`), out);
  const lines = out.split('\n').filter(Boolean);
  results.push({ name, script: SCRIPTS[name], code, seconds: Math.round((Date.now() - started) / 1000), passLines: lines.filter(l => l.startsWith('PASS ')).length, lines });
  return code;
}

console.log('LOCAL SIMULATION (not live evidence) — migrations applied:', sim.applied.length, `(${sim.applied.join(', ')})`);
if (strictGrants) console.log('  regime: strict grants (no default privileges for service_role/authenticated; migration grants only)');
if (skipMigrations.length) console.log('  mutation: migrations skipped =', skipMigrations.join(','));
if (functionsDir) console.log('  mutation: function sources =', functionsDir);
if (postSqlFile) console.log('  mutation: extra SQL after migrations =', postSqlFile);
for (const name of only) await run(name);

// ---------------- post-run audit ------------------------------------------------------------------
const audit = [];
const check = (name, ok, detail = '') => { audit.push({ name, ok: Boolean(ok), detail }); };
check('QA account A still exists', await sim.findByEmail(accounts.A.email));
check('QA account B still exists', await sim.findByEmail(accounts.B.email));
check('no admin delete ever targeted QA A or B', !sim.adminDeletes.some(d => sim.protectedIds.has(d.id)), `${sim.adminDeletes.length} admin deletes in total`);
check('every admin delete targeted the disposable account only', sim.adminDeletes.every(d => d.email === accounts.C.email.toLowerCase()));
const deletionRan = only.includes('deletion') && results.find(r => r.name === 'deletion')?.lines.some(l => l.startsWith('PASS '));
const protectedByRail = Boolean(disposableAs) || (precreate === 'unmarked' && !confirmReset);
if (deletionRan && !protectedByRail) check('disposable account does not exist after the run', !(await sim.findByEmail(accounts.C.email)));
if (precreate === 'unmarked' && !confirmReset) check('an unmarked pre-existing account with the disposable address was left untouched', await sim.findByEmail(accounts.C.email), 'refused, not deleted');

// Server-side order audit over the REAL function's own requests, one invocation at a time.
const invocations = []; let current = null;
for (const e of sim.events) {
  if (e.actor === 'gateway' && e.phase === 'start') current = { events: [] };
  else if (e.actor === 'gateway' && e.phase === 'end') { current.status = e.status; invocations.push(current); current = null; }
  else if (current && e.actor === 'function') current.events.push(e);
}
const kind = e => {
  if (e.path.startsWith('/rest/v1/account_deletion_requests') && e.method === 'POST') return 'freeze';
  if (e.path.startsWith('/rest/v1/account_deletion_receipts') && e.method === 'POST') return 'receipt-pending';
  if (e.path.startsWith('/rest/v1/account_deletion_receipts') && e.method === 'PATCH') return 'receipt-completed';
  if (e.path.startsWith('/rest/v1/account_deletion_receipts') && e.method === 'GET') return 'receipt-status';
  if (e.path.startsWith('/storage/v1/object/list/')) return 'storage-list';
  if (e.path.startsWith('/storage/v1/object/') && e.method === 'DELETE') return 'storage-remove';
  if (e.path.startsWith('/auth/v1/admin/users/') && e.method === 'DELETE') return 'auth-delete';
  if (e.path === '/auth/v1/user') return 'verify-session';
  return e.path;
};
const flows = invocations.map(i => ({ status: i.status, steps: i.events.map(kind) }));
const destructive = flows.filter(f => f.steps.some(s => s === 'storage-remove' || s === 'auth-delete'));
const firstIndex = (steps, what) => steps.indexOf(what);
if (only.includes('deletion') && deletionRan) {
  // Only a run that completed the matrix must have exercised the function (a refusal legitimately makes no requests).
  if (results.find(r => r.name === 'deletion')?.code === 0) check('function invocations observed', flows.length > 0, `${flows.length} invocations, ${destructive.length} destructive`);
  check('every destructive invocation wrote the pending receipt BEFORE any storage removal or Auth deletion',
    destructive.every(f => { const p = firstIndex(f.steps, 'receipt-pending'); const d = Math.min(...['storage-remove', 'auth-delete'].map(s => { const i = firstIndex(f.steps, s); return i < 0 ? Infinity : i; })); return p >= 0 && p < d; }));
  check('every destructive invocation froze writes (request row) BEFORE any storage removal or Auth deletion',
    destructive.every(f => { const p = firstIndex(f.steps, 'freeze'); const d = Math.min(...['storage-remove', 'auth-delete'].map(s => { const i = firstIndex(f.steps, s); return i < 0 ? Infinity : i; })); return p >= 0 && p < d; }));
  check('Auth deletion only ever came AFTER the last storage call of its invocation',
    flows.filter(f => f.steps.includes('auth-delete')).every(f => { const a = f.steps.indexOf('auth-delete'); return !f.steps.slice(a + 1).some(s => s.startsWith('storage-')); }));
  check('receipt completion only ever came AFTER Auth deletion, and only in invocations that deleted Auth',
    flows.filter(f => f.steps.includes('receipt-completed')).every(f => f.steps.indexOf('receipt-completed') > f.steps.indexOf('auth-delete') && f.steps.indexOf('auth-delete') >= 0));
  check('no invocation that answered non-200 ever completed a receipt', flows.filter(f => f.status !== 200).every(f => !f.steps.includes('receipt-completed')));
}

// ---------------- report ---------------------------------------------------------------------------
console.log('\n=== script results (simulation) ===');
for (const r of results) {
  console.log(`${r.code === 0 ? 'OK  ' : 'FAIL'} ${r.script.padEnd(26)} exit=${r.code}  stages passed=${r.passLines}  ${r.seconds}s  log=.cache/sim/${r.name}.log`);
  const tail = r.lines.filter(l => !l.startsWith('PASS ')).slice(-3);
  for (const line of tail) console.log(`       ${line}`);
}
console.log('\n=== server-side audit ===');
for (const a of audit) console.log(`${a.ok ? 'OK  ' : 'FAIL'} ${a.name}${a.detail ? `  (${a.detail})` : ''}`);
await writeFile(join(logDir, 'audit.json'), JSON.stringify({ results: results.map(result => ({ name: result.name, script: result.script, code: result.code, seconds: result.seconds, passLines: result.passLines })), audit, flows }, null, 2));
await sim.stop();
const failed = results.some(r => r.code !== 0) || audit.some(a => !a.ok);
console.log(failed ? '\nSIMULATION RESULT: FAILED (see above)' : '\nSIMULATION RESULT: all scripts and audits passed — simulated only; hosted staging still unverified.');
process.exit(failed ? 1 : 0);
