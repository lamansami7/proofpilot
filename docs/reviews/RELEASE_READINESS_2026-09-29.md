# RELEASE READINESS REVIEW — 2026-09-29

Branch `arena/01a0ecf2-proofpilot`, commit `06f3b8e` + the changes listed below. This review is an
incremental verification pass over the release-readiness work recorded in
[the launch audit](../LAUNCH_AUDIT.md); it does not replace it and it does not lift any gate.

## Outcome

**One genuine product defect was found and fixed. All locally runnable checks pass. Production release
remains blocked** by configuration, hosted verification and the three human reviews. The release
approval variables were deliberately left unset.

## Defect fixed

| Confirmed problem | Root cause and targeted fix | Regression evidence |
|---|---|---|
| Claim-type toggle exposed no state to assistive technology (7 failing browser tests) | `react-native-web@0.19` no longer maps `accessibilityState` to ARIA, so the `Return claim` / `Warranty claim` buttons rendered with no `aria-pressed`/`aria-selected`. The sibling `Chip` component already worked around this; the claim tabs did not. Added `aria-pressed={selected}` to the toggle buttons. | `e2e/purchase-workflow.spec.ts:313` passes at all seven widths; full suite 56/56 twice consecutively. No test, timeout or assertion was changed. |
| Staging/live failure reporting could not tell the operator what to fix and could echo credentials if an error message contained them | `npm run test:live` reported a single generic failure line, and no offline check existed for the staging window. Added `scripts/check-staging-config.mjs` (names missing/unsafe variables, refuses a populated `.env.local` that git does not ignore) and `scripts/live-report.mjs` (assembles the failure message from fixed literals plus a stage name). | 8 new Node tests: every missing variable is named, values are never echoed (asserted against fixture URLs, keys and passwords), and stage reports are asserted not to contain token/email text. |
| No automatic guard that client artifacts are free of privileged material | Added `scripts/scan-client-secrets.mjs` with `npm run check:secrets`; fails closed when no build exists; reports rule and file only. | 4 new Node tests; clean against the real `dist/` export. |
| Deletion safeguards were only asserted for the happy path | Added five handler tests covering missing/malformed bearer, absent password proof, unlisted origin, non-JSON body and target injection — each must perform zero cloud work. | `npm run test:edge` now runs 23 tests. |

## Verified locally (exact counts)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | Passed |
| TypeScript (unused symbols) | `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | Passed |
| Lint | `npm run lint` | Passed, zero findings |
| Unit/component/integration | `npm test -- --runInBand` | **41 suites / 430 tests passed** |
| Release/staging config | `npm run test:release-config` | **28 passed** |
| Client artifact secret scan | `npm run test:client-secrets` | **4 passed** |
| Staging window + live-failure reporting | `npm run test:staging-config` | **8 passed** |
| Embedded PostgreSQL/RLS/RPC | `npm run test:migrations` | **26 checks passed** |
| Offline shell generator | `npm run test:offline` | **1 passed** |
| Patch compatibility | `npm run test:tooling` | **5 checks passed** |
| Edge handlers | `npm run test:edge` | **23 passed** (18 pre-existing + 5 new deletion-safeguard cases) |
| Edge type check | `npm run check:edge` | Both entrypoints passed |
| Web export + offline shell | `npm run build:web` | Passed, shell hash recorded |
| Client artifact secret scan | `npm run check:secrets` | Passed, 7 rules checked, no privileged key |
| Dependency audit | `npm audit --audit-level=low` | 0 vulnerabilities |
| Production dependency audit | `npm audit --omit=dev --audit-level=low` | 0 vulnerabilities |
| Whitespace/patch hygiene | `git diff --check` | Clean |
| Browser suite | `npm run test:e2e` | **56 passed, twice consecutively** |
| Release gate | `npm run check:release` | Correctly blocked (see below) |

New deletion-safeguard regression cases (`supabase/functions/_shared/handlers_test.ts`) assert that a
request without a valid bearer token, without a recent password proof, from an unlisted origin, with a
non-JSON body, or carrying a target `userId`/`email` performs **zero** cloud work, and that every
begin/cleanup/Auth call targets only the verified caller.

New client artifact scanner (`scripts/scan-client-secrets.mjs`) fails closed on `sb_secret_*`,
service-role JWTs (decoded by payload, not by keyword), privileged environment names, provider key
names/hosts/values and private key blocks. It prints rule and file only, never the matched value, and
fails when no build exists. It is wired to `npm run check:secrets` / `npm run test:client-secrets`.

## Hosted inspection (read-only, no credentials used)

Requests below were made from outside this sandbox (managed proxy fetch, read-only, no secrets).

| Observation | Interpretation |
|---|---|
| `GET https://kqepazkcunxfitjexjqc.supabase.co/functions/v1/delete-account` → `{"error":"method_not_allowed"}` | The `delete-account` route responds with the expected handler-level method rejection. **ACTIVE status in the Supabase control plane and authenticated deletion are not verified by this probe.** |
| `GET https://kqepazkcunxfitjexjqc.supabase.co/functions/v1/proofpilot-ai` → `{"error":"method_not_allowed"}` | The `proofpilot-ai` route responds with the expected handler-level method rejection. **ACTIVE status and provider/quota behavior require authenticated checks.** |
| `GET .../auth/v1/health` → `{"message":"No API key found in request"}` | Project gateway is up and requires an API key; the anonymous request was rejected. |
| `GET https://get-proofpilot.lovable.app/privacy` → real policy page; states "This document has not been reviewed by a lawyer." | The policy URL is live and serves policy content. **It is not evidence of legal compliance or legal review.** |
| `https://get-proofpilot.lovable.app/` advertises reminders ("30 / 7 / 1 day reminders"), an AI assistant and household sharing; `/support` repeats "Household members can only see purchases you have explicitly shared". | **Inconsistent with the shipped product**: `README.md` records notifications as unavailable, and migration `202609260001_deletion_integrity.sql` disables legacy household reads because there is no sharing/consent UI. Public claims must be corrected or the features implemented before launch. |
| `https://get-proofpilot.lovable.app/auth` states web sign-in "goes live … as soon as the ProofPilot backend is connected to this site". | The production web origin named by `EXPO_PUBLIC_AUTH_REDIRECT_URL` does not currently complete a PKCE callback. Either host the web client (with SPA fallback) on that origin or point the redirect and the Supabase allowlist at the origin that does. |

Verified in this pass: project gateway responds, both function routes respond to an unauthenticated
GET with the expected method error, and the policy URL serves content. **Not verified:** Supabase
control-plane ACTIVE status, migration history, function secrets, Auth URL allowlist, RLS behaviour
on the hosted database, or any authenticated POST. Those require the operator's credentials.

## Environment limits encountered

- Outbound TLS from the sandbox to `api.supabase.com`, `*.supabase.co`, `expo.dev` and `api.expo.dev`
  is blocked, so no CLI, deploy or authenticated probe could be run here.
- The Supabase CLI (2.118.0) installs and runs, but `supabase projects list` reports "Access token not
  provided" and this clone has no `supabase/.temp` link, so no hosted command was attempted.
- No `.env.local` exists in this clone, so `npm run check:release` reports nine blockers (five
  configuration values plus the deletion switch plus the three reviews) and `npm run test:live`
  refuses to run at all. Both are correct fail-closed behaviour.

## Human-only gates (unchanged by this pass)

`PROOFPILOT_LIVE_VERIFICATION_APPROVED`, `PROOFPILOT_DEVICE_VERIFICATION_APPROVED` and
`PROOFPILOT_LEGAL_VERIFICATION_APPROVED` remain unset. `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED` must
stay `false` until the deletion service is verified against a dedicated staging project by an operator.

## Continuation evidence — 2026-09-29 (this checkout)

These are checks actually rerun in this continuation; the earlier results above are retained as
historical evidence, not substituted for current hosted approval.

| Check performed now | Result |
|---|---|
| `npm run typecheck`; `npm run lint` | Both passed. |
| `npm test -- --runInBand` | 41 suites / 430 tests passed. |
| `npm run test:edge`; `npm run check:edge` (Deno 2.9.6 on PATH) | 23 handler tests passed; both entrypoints typechecked. |
| `npm run build:web`; `npm run check:secrets` | Build passed, offline shell version `531670372e56c7cf`; 7 client-artifact scan rules passed. |
| `npm run test:release-config`; `npm run test:staging-config`; `npm run test:client-secrets` | 28 + 8 + 4 tests passed. |
| `npm run test:migrations`; `npm run test:offline`; `npm run test:tooling` | 26 + 1 + 5 checks passed. Embedded migrations are **not** proof of remote migration history. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium LD_LIBRARY_PATH=/tmp/al2023lib/lib npm run test:e2e` | 56/56 passed using a temporary npm-sourced Chromium (not a native-device test). |
| `git diff --check` | Passed. |
| `npm run check:release` | Blocked: five required public config values absent, deletion not enabled/verified, live/device/legal review unset. No flags changed. |
| `npm run check:staging`; `npm run test:live` | Preflight failed on missing staging ref/URL/public key/explicit opt-in/two QA credential pairs; live script exited 2 before any network activity. **No live assertions ran.** |

`.env.local` is **absent** and ignored by `.gitignore`; none of the ten individually requested
release variables (Supabase URL/public key, privacy URL, auth redirect, support email, optional AI
endpoint, deletion switch, live/device/legal approvals) is present in this process either. Consequently
there is no real key in this checkout to validate. A synthetic `sb_publishable_`-prefix fixture was
accepted by `publicClientKey()` and a synthetic `sb_secret_`-prefix fixture was rejected; the 28
release-config tests also pass. This proves the checker's *format* behavior, not ownership or validity
of a hosted key. The unset deletion switch is **effectively disabled** (`accountDeletionEnabled`
requires it to equal `true` and a configured Supabase client). Optional AI stays unconfigured.

Supabase CLI 2.118.0 is installed temporarily, but this checkout has no `supabase/.temp` link or
`SUPABASE_ACCESS_TOKEN`. Actual attempts at `supabase migration list` and `supabase functions list
--project-ref kqepazkcunxfitjexjqc` both exited 1 (respectively "Cannot find project ref" and
"Access token not provided"). **Remote migration parity and control-plane ACTIVE status are
unverified**, despite the two GET routes returning the expected method error again today. No Docker
is needed for these remote listing commands. Do not run `supabase config push` on this local-dev
`supabase/config.toml`: its Auth Site URL and redirects are localhost.

EAS CLI 24.8.0 was installed temporarily and queried: `eas whoami --non-interactive` exited 1
("Not logged in") and `eas project:info --non-interactive` exited 1 (Expo login/token required).
`EXPO_TOKEN` is absent. `app.json` statically declares owner `lamansami7`, project ID
`35a5ac4e-462a-46f9-85a7-087ffffdb41f`, scheme `proofpilot`, matching native identifier
`com.proofpilot.app`, Android versionCode 1, iOS buildNumber 1; `eas.json` declares preview and
production build profiles. **Ownership, signed builds, store readiness and real-device behavior
are not verified.**

### Public-site discrepancy: explicit publication decision required

Fresh read-only requests to `https://get-proofpilot.lovable.app/`, `/support`, `/privacy`, `/terms`
and `/auth` show that the deployed Lovable site is a **separate website**, not a directory in this
repository. There is no source here that can be edited to update that site; editing the Expo app or
this review will not change its public copy. The operator must update the **actual site** and confirm
its deployed pages (or implement and independently test the real features before advertising them):

| Live page / claim | Repo evidence | Required correction before launch |
|---|---|---|
| Home: "get reminders", "30 / 7 / 1 day reminders"; privacy: "Notifications — reminders generated"; terms: "Deadline reminders are a convenience" | `src/components/settingsScreen.tsx` says no reminders are sent; `src/components/deadlineRadar.tsx` and `src/components/dashboard.tsx` agree. A `notifications` table/reminder-preference columns in the initial schema are **not a delivery/scheduler implementation**. | Remove notification/reminder-delivery promises from home, privacy and terms. Describe **in-app deadline viewing** only until scheduling, sending and real-device receipt have been verified. |
| Home and privacy: records readable by explicitly shared household members; support: shared purchases visible to household | Migration `202609260001_deletion_integrity.sql` explicitly replaces the purchase SELECT policy with owner-only reads, and rewrites `can_access_purchase()` as owner-only. There is no household sharing/consent UI. Remote migration history is still unknown. | Remove household-sharing and household-access claims. Do not weaken RLS to match marketing. |
| Privacy/support: uploaded documents are kept in private cloud Storage; support says other accounts are barred from seeing uploaded files | `docs/PRIVACY.md` documents **local** browser/native binary attachments; backups/exports do not restore those bytes. Cloud records can contain document metadata. | Disclose local-only binaries, loss on app/site data clearing, metadata-only backup, and keep-originals guidance; do not claim cloud backup for binaries. Verify any hosted behavior independently. |
| Home/privacy/support/terms: account deletion from Settings is available/permanent | `src/lib/accountDeletion.ts` gates the UI behind `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED === 'true'`; it is not enabled here and there is no authenticated hosted deletion test. `docs/LAUNCH_AUDIT.md` records an unresolved lost-response recovery/support risk. | Do not promise self-service deletion as available until authenticated destructive QA, partial-failure/lost-response recovery and private support are verified and approved; provide an actual independent deletion-request/support route for launch. |
| Home/support/terms: one account works for web and app; `/auth`: "Web sign-in is being connected" | Live `/auth` has no working signup/signin/PKCE callback, even though the Expo client contains native `proofpilot://auth/callback` handling. | Connect the actual web client and callback at the allow-listed HTTPS origin **or** point both the production redirect and Supabase allowlist at the real app origin; then test confirmation/reset on real emails/devices. Do not claim web account availability beforehand. |
| Home advertises AI; support/privacy describe an active provider | `EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT` is absent here; AI is optional. Edge route GET exists, but provider secrets, enabled mode and authenticated quota behavior are unverified. | Make marketing conditional on **verified enabled AI**; otherwise describe it as unavailable. |
| Support: "every message goes to our support inbox and a person replies" | A public mailto address is visible; there is no evidence here of inbox ownership or response operations. | Operator must verify actual mailbox ownership and response process; revise claims if not operational. |

The site's privacy page says "This document has not been reviewed by a lawyer" and its terms page
says it "requires legal review". `docs/PRIVACY.md` is explicitly a draft. **Legal approval is
pending**; proposed copy corrections above are not legal advice or an approval. The Site URL and
redirect allowlist cannot be read without authenticated Supabase access. The native scheme and
exact callback are present in `app.json`/`src/lib/authRedirect.ts`, but do not prove dashboard
configuration. Website claims and redirects must be reconciled **before** enabling deletion or
marking live/device/legal reviews complete.

### Operator continuation (only after secure credentials and a dedicated staging window exist)

1. In a credentialed environment, identify and link the **intended staging** project; run
   `supabase link --project-ref kqepazkcunxfitjexjqc`, then `supabase migration list` and
   `supabase functions list --project-ref kqepazkcunxfitjexjqc`. Compare every local filename to
   applied remote history and both function statuses. Linking is not migration deployment. If this
   project holds real customers, use a separate disposable staging project instead for destructive
   testing. Do not push local-dev Auth config.
2. Privately supply the staging URL, **public** `sb_publishable_` key, explicit opt-in and **two
   different email-confirmed QA accounts** through ignored `.env.local` or secure process env;
   run `npm run check:staging` followed by `npm run test:live`. Never use customer accounts.
3. On a **third disposable QA account** with actual Auth/Storage/database inspection, exercise
   fresh-password deletion, partial cleanup/retry, Auth-last ordering, cascades, final-response loss
   and offline local-ledger recovery. Only enable the deletion UI after real evidence and support
   recovery approval; do not infer success from a GET response or a failed sign-in.
4. In authenticated Supabase Auth settings, inspect Site URL and *exact* allowed HTTPS web origin
   and `proofpilot://auth/callback` entry; verify end-to-end email confirmation/reset and PKCE.
   Do not infer settings from `supabase/config.toml` or the redirect-format check.
5. Run `eas whoami` and `eas project:info` when authenticated; build and install preview binaries
   on real Android and iOS devices, test deep links, secure storage, camera/files, offline and
   accessibility. Require actual owner, device and store-policy review before device sign-off.
6. Correct the external site's copy/behavior above and obtain real human legal/privacy review of
   the updated public privacy and terms documents. Set approval flags **only after** the relevant
   live, device and legal reviews, then rerun `npm run check:release`.

## Follow-up verification — generated web export isolation

The full requested suite was rerun from commit `3c62684`. Running `npm run typecheck` concurrently
with `npm run build:web` exposed a real tooling race: TypeScript's default `**/*` input included
ignored JavaScript from `dist/`, and Expo removed those files while rewriting the export; TypeScript
failed with TS6053 for a bundle and the service worker. `tsconfig.json` now excludes **only** the
generated `dist/` tree (not application source). `npm run typecheck` and `npm run lint` pass after
the change; a concurrent web rebuild and typecheck also pass. `tsc --listFilesOnly` reported **zero**
generated `dist/` files and **92** application files. The independent `npm run build:web` and
`npm run check:secrets` still pass (7 artifact scan rules); the client-artifact security check was
not removed or relaxed. After rebuilding, the complete browser suite passed **56/56**.

Also rerun in this follow-up: 41 Jest suites / 430 tests; 28 release-config tests; 26 embedded
migration checks; 1 offline-shell test; 5 tooling checks; 23 Edge tests; both Edge entrypoints
checked; 4 client-secret-scanner tests; 8 staging-config tests; `npm audit --audit-level=low` and
`npm audit --omit=dev --audit-level=low` each reported **zero vulnerabilities**; `git diff --check`
passed. The public site's reminders/household/cloud-attachment/deletion/web-signin claims and
pending legal language were rechecked and remain as documented above; **no external site change
was made**.

`.env.local` remains absent and ignored. `npm run check:staging` failed on absent staging ref,
URL/public key, explicit opt-in and both QA account pairs; `npm run test:live` was **not run** because
that preflight failed. `supabase projects list`, `supabase migration list`, and both forms of
`supabase functions list` exited 1 due to absent authentication and/or missing local project link.
A secrets-list attempt also exited 1; its output was withheld, and **no server secret names or
values were verified**. The deletion route again answered an unauthenticated GET with the expected
method error, not an authenticated deletion result. The release gate still reports its nine
configuration/review blockers; no flag was enabled and no approval was inferred.
