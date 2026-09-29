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

## Verified locally (exact counts)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | Passed |
| TypeScript (unused symbols) | `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | Passed |
| Lint | `npm run lint` | Passed, zero findings |
| Unit/component/integration | `npm test -- --runInBand` | **41 suites / 430 tests passed** |
| Release/staging config | `npm run test:release-config` | **28 passed** |
| Client artifact secret scan | `npm run test:client-secrets` | **4 passed** |
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
| `GET https://kqepazkcunxfitjexjqc.supabase.co/functions/v1/delete-account` → `{"error":"method_not_allowed"}` | `delete-account` is deployed, ACTIVE and serving this repository's handler contract (method check precedes authentication). |
| `GET https://kqepazkcunxfitjexjqc.supabase.co/functions/v1/proofpilot-ai` → `{"error":"method_not_allowed"}` | `proofpilot-ai` is deployed and ACTIVE on the same project. |
| `GET .../auth/v1/health` → `{"message":"No API key found in request"}` | Project gateway is up and requires an API key; the anonymous request was rejected. |
| `GET https://get-proofpilot.lovable.app/privacy` → real policy page; states "This document has not been reviewed by a lawyer." | The policy URL is live and serves policy content. **It is not evidence of legal compliance or legal review.** |
| `https://get-proofpilot.lovable.app/` advertises reminders ("30 / 7 / 1 day reminders"), an AI assistant and household sharing; `/support` repeats "Household members can only see purchases you have explicitly shared". | **Inconsistent with the shipped product**: `README.md` records notifications as unavailable, and migration `202609260001_deletion_integrity.sql` disables legacy household reads because there is no sharing/consent UI. Public claims must be corrected or the features implemented before launch. |
| `https://get-proofpilot.lovable.app/auth` states web sign-in "goes live … as soon as the ProofPilot backend is connected to this site". | The production web origin named by `EXPO_PUBLIC_AUTH_REDIRECT_URL` does not currently complete a PKCE callback. Either host the web client (with SPA fallback) on that origin or point the redirect and the Supabase allowlist at the origin that does. |

Verified in this pass: project exists and responds, both functions are live, the policy URL is live.
**Not verified:** migration history, function secrets, Auth URL allowlist, RLS behaviour on the hosted
database, any authenticated POST. Those require the operator's credentials.

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
