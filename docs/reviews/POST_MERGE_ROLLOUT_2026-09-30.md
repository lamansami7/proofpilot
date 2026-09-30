# Post-merge rollout verification — 2026-09-30

**Base:** `main` at `3aa07f8` (merge of PR #13, the account-deletion receipt protocol).
**Verdict: NOT RELEASE-READY. The hosted rollout was not performed and nothing is VERIFIED LIVE.**
Rollout steps 1–4 and the live runs need Supabase credentials, a staging project reference and network
access, none of which this environment has. `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED` stays `false`; no approval
variable was set.

Evidence labels used below: **LIVE** = observed on a hosted Supabase project (none); **LOCAL** = ran in this
repository (Jest, PGlite on the real migrations, Deno/Node tests); **SIMULATED** = the real scripts, real
Edge Function source and real migration SQL against an emulated Auth/Storage/PostgREST
(`npm run test:live:sim`). SIMULATED shows the pieces agree with each other; it is never LIVE evidence.

## 1. Staged rollout, in the requested order

| # | Step | Result | Evidence |
|---|------|--------|----------|
| 1 | Confirm migration state (`supabase migration list`) | **BLOCKED** | exit 1, `Cannot find project ref. Have you run supabase link?`. No link, no access token, no project ref; TLS to `api.supabase.com` and `*.supabase.co` fails from this sandbox (`curl` exit 35). |
| 2 | Apply `202609300001_deletion_receipts.sql` | **NOT RUN** | depends on 1; not attempted out of order. |
| 3 | `supabase functions deploy delete-account` | **NOT RUN** | depends on 2. |
| 4 | Confirm the deployed function is the receipt implementation | **NOT RUN** | needs 3. The probe and its three answers are in `OPERATOR_RUNBOOK.md` ("Confirm which `delete-account` is deployed"); the answers were produced by the real function source, the same source without its migration, and the real pre-receipt revision `05ec3ce`, all under the simulation. |
| 5 | `npm run check:staging` | exit **1**, refused | names 8 missing variables, prints no values. Not a readiness result. |
| 6 | `npm run test:live` | exit **2**, `Not run` | refusal, no network call made. |
| 7 | `npm run test:live:storage` | exit **2**, `Not run` | refusal. |
| 8 | `npm run test:live:deletion` | exit **2**, `Not run` | refusal. |

Steps 5–8 were run only to record their refusal behaviour; they are not live evidence.

## 2. Defects found in the merged live tooling (all in test tooling; no product code changed)

The live scripts had never executed past their configuration guard. Running them for the first time against
the simulation found the following. Each is reproduced against the **original** merged scripts and fixed on
this branch; the fixes are **not on `main`** until merged.

| # | Defect | Effect on a live run | Evidence |
|---|--------|----------------------|----------|
| 1 | `verify-deletion-live.mjs` called `admin.auth.admin.getUserByEmail` (5 sites). It does not exist in the pinned supabase-js 2.117.1. | The matrix died at its first real stage with `TypeError: … is not a function`. | offline proof against the pinned library; `live-scripts.test.mjs` fails on the original script. |
| 2 | `generateLink` result read as `data.action_link`; the real shape is `data.properties.action_link`. | The "missing password proof" stage would fail. | offline proof with a stubbed Auth response. |
| 3 | Service-key check (`check:staging` and the script) demanded JWT `role === 'service'`. Supabase issues `service_role`; `sb_secret_…` keys were also refused. The test fixture used the fake value, so the unit test passed. | Preflight refused every real service key; the destructive run could never start. | original preflight: real `service_role` JWT → rejected, `sb_secret_` → rejected, fake `role:"service"` → accepted. |
| 4 | No database rows were seeded before deletion, so "database records are cascade-removed" compared 0 rows with 0 rows. | Matrix item 12 passed vacuously. | source review; seeds added (purchase + tombstone), asserted present before and absent after. |
| 5 | Privileged evidence queries ignored `error`; a failed query (for example no `service_role` grant on a table) read as "0 rows". | Silent passes. | source review; replaced by `evidenceRows()`, which throws and prints a fixed `EVIDENCE BLOCKED` hint. |
| 6 | Storage `remove()` was given bare strings in 5 places, and the foreign-delete stages asserted an error. Storage is expected to answer an RLS-denied delete with 200 and nothing removed, because the database layer does exactly that (the repo's own PGlite test shows it). | Bare strings depend on server coercion; the assertion would fail on a correct system. | offline request-body proof; simulation reproduces the failure on the original assertion. Hosted Storage behaviour is **unverified**; the fix holds under either behaviour and proves the object survived. |
| 7 | `finally` cleanup and the start-of-run reset could not remove Storage residue first, and could delete a pre-existing address it did not create. | Stuck re-runs after a failure; a mistyped address could delete a real account. | fixed: Storage purge before Auth removal, a `user_metadata` marker, and exit-2 refusal of an unmarked address unless `PROOFPILOT_DELETE_TEST_CONFIRM_RESET=yes`. |

Also hardened: six forged-target key names instead of one, the freeze stage must fail for the right reason
(`Account deletion is in progress`) and leave no row or object behind, the stale-refresh stage must not mint a
session, the deleted-Auth check must be a 404 rather than any error, and QA A/B are checked by identity.

## 3. The 19-item deletion matrix

The repository names the matrix items but never numbers them; this numbering is mine and covers every item
in the request. **LIVE status for every row: not run.** "Stage" = `verify-deletion-live.mjs` stage name.

| # | Item | Stage(s) | LOCAL / SIMULATED evidence |
|---|------|----------|----------------------------|
| 1 | Recent-password enforcement | every destructive attempt follows a fresh sign-in; "final retry completes deletion…" | handler tests; simulation; control `password-recency-off` |
| 2 | Missing password proof refused | "missing password proof is refused…" | handler test; simulation |
| 3 | Stale proof (>5 min) refused | "stale password proof beyond five minutes…" | handler tests; simulation (accelerated and real-time clock) |
| 4 | Forged target denial | "forged deletion target fields are rejected…" | handler test; control `forged-target-accepted` |
| 5 | Wrong-account protection | forged target, "wrong-account attempts…", final A/B stage | handler test; audit: no admin delete ever named A or B |
| 6 | Deletion request created | "failed attempt created the durable deletion request" | PGlite; control `freeze-request-skipped` |
| 7 | Cloud-write freeze (DB and Storage) | "cloud writes are frozen during cleanup retry" | PGlite; control `writes-not-frozen` |
| 8 | Storage cleanup | "storage objects are fully removed" | simulation; control `storage-cleanup-skipped` |
| 9 | Partial cleanup failure | "deletion with a broken storage hierarchy fails…", "auth survives failed storage cleanup" | handler tests; control `depth-guard-removed` |
| 10 | Retry behaviour | "owner removes the blocking deep object…", "final retry completes…" | simulation |
| 11 | More than 1,000 Storage objects | "upload more than 1,000…", "retry with more than 1,000 objects pauses cleanup…" | simulation; control `cleanup-cap-removed` |
| 12 | Database cascade | "seed purchase and tombstone rows…", "database records are cascade-removed" | PGlite; simulation |
| 13 | Auth deletion ordering | "auth survives failed storage cleanup", "auth user is deleted only after cleanup completed" | handler tests; audit; controls `auth-deleted-first`, `auth-never-deleted` |
| 14 | No resurrection | "stale refresh token cannot resurrect…", "deleted purchases remain deleted…" | PGlite (45 assertions, 4 new); simulation |
| 15 | Deleted account cannot write | "old session cannot write after deletion" | PGlite (new assertions); simulation |
| 16 | Repeated / idempotent deletion | "repeated deletion attempt cannot run without a session", "completed receipt confirms repeatedly…" | handler tests; simulation |
| 17 | Truthful failure | 503/409 stages assert `deleted !== true`; "in-progress receipt reports pending, never completed" | handler tests; Jest client tests; control `pending-reads-completed` |
| 18 | Lost final-response receipt recovery | "discarded deletion response is confirmed only by receipt status", "server state matches the receipt…" | Jest client tests; handler tests; simulation |
| 19 | QA A and B still work afterwards | "QA accounts A and B remain intact at the end of the run" | simulation audit |

## 4. Lost-response receipt protocol

| Requirement | Evidence (none LIVE) |
|-------------|----------------------|
| Pending receipt before destructive work | handler test; simulation audit over every destructive invocation (freeze and pending receipt precede any Storage removal or Auth deletion); control `receipt-pending-after-destruction` |
| Completed only after Auth deletion | handler tests (`a failed completion write never reports successful deletion`); audit; control `receipt-completed-before-auth` |
| Never falsely confirms | server: pending and unknown never read as completed (control `pending-reads-completed`); client Jest: foreign user id, pending, unknown, offline and malformed ledger all stay blocked |
| Does not hydrate deleted data | new `purgeGate.test.tsx` (closed gate reads nothing, syncs nothing, rejects every write; fails if the gate is disabled). The `App.tsx` wiring and blocked screen are covered by an e2e spec that **could not run here** (Chromium download blocked) |
| Stale writes cannot resurrect | PGlite tombstone, closing-account and deleted-user assertions; simulation stages 14–15 |
| Documented safe retry / support path | `OPERATOR_RUNBOOK.md` "Lost-response recovery"; the in-app "Retry device cleanup" re-probes the receipt. See observation 3 |

## 5. Checks, before and after

Before = unmodified `3aa07f8`. After = this branch. All exit 0 unless stated.

| Check | Before | After |
|-------|--------|-------|
| `npm test -- --runInBand` | 41 suites / 443 tests | 42 suites / 446 tests |
| `npm run test:migrations` | 41 assertions | 45 assertions |
| `npm run test:edge` (Deno 2.9.6 via npm) | 29 | 29 |
| `npm run check:edge` | pass | pass |
| `npm run typecheck`, `npm run lint` | pass | pass |
| `npm run build:web` | pass, shell `a64499c599d72f49` | pass, same hash |
| `npm run check:secrets` | pass, 7 rules | pass |
| `test:tooling` / `release-config` / `staging-config` / `client-secrets` / `offline` | 5 / 30 / 11 / 4 / 1 | 5 / 30 / 11 / 4 / 1 |
| `npm run test:live-scripts` (new) | n/a | 13 |
| `npm run check:release` | **exit 1, 9 blockers** | **exit 1, same 9 blockers** |

`check:release` needs `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true` to pass, so it cannot go green while the
flag is correctly `false`. Do not enable the flag to satisfy the gate.

Simulation: all three scripts pass (32 deletion stages, 21 storage stages) with an accelerated clock and again
in real time (5 m 06 s). `npm run test:live:sim:controls`: all 22 controls behave as required. 4 must pass (the
unmodified function; the strict-grants regime with the documented grant; a marked leftover account; an
unmarked account with explicit confirmation), 4 must refuse or fail loudly (missing evidence grant; an
unmarked address; a disposable address equal to QA A; equal to QA B), and 14 injected faults must be caught. Two controls were first mis-predicted by me (where detection occurs, not whether); they
were corrected and re-run, not dropped.

## 6. Observations that need an owner decision (no code was changed for these)

1. **A failed receipt write still freezes the account.** `begin()` (freeze) runs before `receiptPending()`.
   If the function is deployed before the migration, one attempt answers 503, destroys nothing, and leaves that
   account's cloud writes refused until a deletion completes (reproduced). The runbook previously claimed
   "deletion refuses to start"; it now states this. Moving `receiptPending` ahead of `begin` would make the
   failure side-effect free; that is a protocol change, so it is yours to decide.
2. **A client retry overwrites the earlier receipt** in its local ledger. If an earlier request is still
   running server-side while the user retries, the app can stay blocked until support verifies. Keeping every
   unconfirmed receipt would remove it. Low probability.
3. **Support path.** An operator cannot complete a stuck receipt; the documented path tells the user to clear
   local app data, which also erases other accounts' local originals on that device. A documented,
   operator-verified completion step would let "Retry device cleanup" finish without that cost.
4. **Requests without a receipt still delete** (legacy clients). Decide when to require receipts.
5. **Supabase default grants.** Reported: no automatic Data API grants for new `public` tables on new projects
   since 2026-05-30 and, for tables created on existing projects, from 2026-10-30. The shipped migrations
   grant explicitly what the product needs, and the simulation in strict-grants mode confirms it. The script's
   privileged evidence queries need a staging-only `GRANT SELECT` (runbook).
6. **The automated lost-response case discards a received response**; it does not cut the connection
   mid-flight. Runtime behaviour on client abort is unverified.

## 7. Not verified by this work

Every hosted behaviour: Auth, Storage (RLS denial semantics, listing order, `remove()` results), the Edge
runtime, the real JWT `amr` contents, rate limits, SMTP and redirects, real devices, the browser e2e suite,
native builds, legal and support approvals. The simulation's Storage and Auth emulation follows public
documentation and may be wrong; its known gaps are listed in `OPERATOR_RUNBOOK.md`.
