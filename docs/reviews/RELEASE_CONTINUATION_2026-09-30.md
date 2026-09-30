# RELEASE CONTINUATION REVIEW — 2026-09-30

Branch `arena/01a0f221-proofpilot`, starting from `05ec3ce` (PR #11 merge) with the state handoff
in issue #12. This pass continues the prior work; it does not replace
[the launch audit](../LAUNCH_AUDIT.md) and it does not lift any gate. **Release remains BLOCKED.**
No approval variable was set and `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED` remains `false`.

## Outcome

One architecture-level gap was closed in code: the lost-final-response recovery blocker now has a
server receipt protocol (implemented, locally verified, deployment pending). One security
configuration gap was fixed: wildcard hosts/paths are rejected everywhere a public URL or auth
redirect is validated. Two runnable live-verification scripts were added (19-item deletion matrix;
storage RLS matrix). Everything runnable in this sandbox was run and passes. **The destructive
staging matrix could not be executed here**: this sandbox cannot open TLS connections to
`*.supabase.co` (curl exits 35 `SSL_ERROR_SYSCALL` after DNS resolves; only an allowlist including
npm/GitHub works, and the managed fetch proxy is GET-only), and no staging credentials were
injected. Playwright's browser CDN is likewise blocked, so `npm run test:e2e` could not be
re-run here.

## 1. FIXED

| Change | Why | Regression evidence |
|---|---|---|
| **Lost-response receipt protocol** — new migration `supabase/migrations/202609300001_deletion_receipts.sql`; `delete-account` now records a hash-only pending receipt before destructive work and `completed_at` only after Auth deletion, and answers an unauthenticated `{receipt}` status probe; `src/lib/accountDeletion.ts` generates a 256-bit receipt into the durable ledger and confirms deletion only on an exact `state:"completed"` + matching user id — never on failed sign-in | Prior audit: server deletion could succeed while its response was lost, leaving no safe recovery (launch blocker) | Jest: 23 deletion/recovery tests (incl. lost-response confirm, pending/unknown/offline stay blocked, foreign user id never confirms, malformed ledger fails closed). Deno: 6 new handler tests (ordering pending→files→auth→completed, status performs zero cloud work, malformed receipt 400, pending-write failure aborts before destructive work, completion-write failure never reports success, GET/origin refusals) |
| **Wildcard redirect rejection** — `publicHttps()` and the client's `isValidProductionRedirect()` now reject any `*` | `https://*.lovable.app` and `https://site/*` previously passed both validators; the task requires no wildcard redirects | 2 new release-config cases + 1 new authRedirect test; `publicHttps('https://*.lovable.app')` now false |
| **Storage/RLS migration-test matrix (P3)** — owner-cannot-update, B-cannot-delete/modify (flat + nested), nested foreign-prefix upload denial, private/20 MiB/PDF-JPEG-PNG bucket declaration, receipts-table client denial, receipts survive `auth.users` removal | Matrix items were untested locally | `npm run test:migrations`: **41 assertions** (was 26) |
| **Destructive live matrix tooling (P1)** — `scripts/verify-deletion-live.mjs` + `PROOFPILOT_DELETE_TEST_EMAIL`/`PROOFPILOT_DELETE_TEST_PASSWORD`/`PROOFPILOT_SERVICE_ROLE_KEY` validation in `check:staging` + `npm run test:live:deletion` | Handoff task: third disposable account + 19-item matrix | Script refuses (exit 2) without full config; refuses if disposable email equals QA A or B (code rail, tested); 3 new config tests |
| **Storage live matrix tooling (P3)** — `scripts/verify-storage-live.mjs` + `npm run test:live:storage`, normal sessions only, no service role as RLS evidence | Live storage matrix must run with ordinary users | Script refuses (exit 2) without staging config; 1 new config test |
| **Runbook/README truth-up** — six migrations (deploy receipt migration BEFORE the function update), new commands, npx-deno fallback, exact lost-response support procedure | Documentation must match the code | Reviewed in this pass |

## 2. VERIFIED LOCALLY (exact commands and results, this pass)

| Check | Command | Result |
|---|---|---|
| Unit/integration | `npm test` | **41 suites / 443 tests passed** (was 430) |
| PostgreSQL RLS/migrations (PGlite) | `npm run test:migrations` | **41 assertions passed** (was 26) |
| Edge handlers (Deno 2.9.6 via `npx -y deno`) | `npm run test:edge` equivalent | **29 passed** (was 23) |
| Edge typecheck | `npm run check:edge` equivalent | Both entrypoints pass |
| TypeScript | `npm run typecheck` and `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | Pass |
| Lint | `npm run lint` | Pass, zero findings |
| Tooling | `npm run test:tooling` | 5 passed |
| Release config | `npm run test:release-config` | **30 passed** (was 28) |
| Staging config | `npm run test:staging-config` | **11 passed** (was 8) |
| Client secret scan (source) | `npm run test:client-secrets` | 4 passed |
| Offline shell | `npm run test:offline` | 1 passed |
| Web export + offline shell | `npm run build:web` | Passed (shell `a64499c599d72f49`) |
| Client artifact secrets | `npm run check:secrets` | 7 rules, no privileged key/provider secret in `dist/` |
| Dependency audit | `npm audit` | 0 vulnerabilities |
| Whitespace | `git diff --check` | Pass |
| Staging preflight refusal | `npm run check:staging` | Correctly exits 1 naming every missing variable; prints no values |
| Live script refusals | `npm run test:live`, `test:live:storage`, `test:live:deletion` | All exit 2 without opt-in/config |
| Release gate | `npm run check:release` | **BLOCKED, exit 1**, 9 named blockers; no approval variable set; deletion switch still `false` |

Environment notes (truthful, so the next session does not repeat them): the official Deno
installer host is blocked here but `npx -y deno` works via the npm registry; Playwright's Chromium
download is blocked (`cdn.playwright.dev` unreachable) so browser E2E is **BLOCKED** in this
sandbox (last recorded pass remains 56/56 on 2026-09-29, not re-run today).

## 3. VERIFIED LIVE (credential-free, read-only, through the managed fetch proxy)

| Probe | Result | What it does NOT prove |
|---|---|---|
| `GET https://kqepazkcunxfitjexjqc.supabase.co/functions/v1/delete-account` | `{"error":"method_not_allowed"}` | Route responds with this repo's contract. It does **not** prove the receipt-protocol build is deployed (it is not deployed yet), ACTIVE status, or authenticated behavior. |
| `GET .../functions/v1/proofpilot-ai` | `{"error":"method_not_allowed"}` | Same: route up only. AI stays disabled. |
| `GET .../auth/v1/health` | `{"message":"No API key found in request"}` | Gateway up and keyless requests rejected. |

**VERIFIED LIVE for the 19-item deletion matrix, storage RLS, auth flows, SMTP and receipt
recovery: NONE — BLOCKED in this sandbox** (no TLS egress to `*.supabase.co`; GET-only proxy; no
staging credentials injected). These are not "missing tests"; they are queued behind the exact
commands in section 6.

## 4. Priority classification (P1–P9)

| Priority | Classification |
|---|---|
| P1 staging deletion matrix | **BLOCKED** (network + credentials). Tooling complete and refusal-tested: `npm run test:live:deletion`. Script covers all 19 items incl. recent/missing/stale proof, forged target, wrong-account, request creation, freeze, partial-failure (deep-hierarchy injection), retry, >1,000 objects, cascade, Auth-last ordering, persistence, no-resurrection, repeated deletion, never-false-success, lost-response receipt confirmation, QA A/B intact. |
| P2 lost final response | **Implemented + VERIFIED LOCALLY; REQUIRES EXTERNAL SERVICE for live confirmation → remains a launch blocker until `test:live:deletion` passes and the support procedure is approved.** Never treats failed sign-in as proof; pending/unknown stay blocked with no hydration and no success UI. |
| P3 storage/RLS | **VERIFIED LOCALLY** (41 migration assertions + new live script); **REQUIRES EXTERNAL SERVICE** for hosted bucket behavior (type/size enforcement, signed URLs, real storage service). |
| P4 auth | **VERIFIED LOCALLY** (PKCE flow config, exact `proofpilot://auth/callback` parsing, production-redirect validation incl. new wildcard rejection, throttling, session persistence tests — 24 authRedirect + related suites). **REQUIRES CONFIGURATION** (dashboard Site URL, exact redirect allowlist entries, email confirmation on, min password ≥ 8). **REQUIRES EXTERNAL SERVICE** (expired/reused links, browser restart, real email delivery). |
| P5 SMTP | **REQUIRES EXTERNAL SERVICE.** Exact settings to configure are in OPERATOR_RUNBOOK.md §2 (SMTP host/port/user/password, verified sender, SPF/DKIM/DMARC, link-tracking off, Site URL, redirect allowlist). No credentials exist or were requested in chat. |
| P6 AI | **VERIFIED LOCALLY, stays DISABLED** (`AI_ENABLED` unset/false, no provider key, `EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT` blank). Edge tests cover missing/expired JWT 401, origin 403, malformed/oversize 400-before-quota, disabled 503, quota 429, quota-store failure 503, provider failure 503, malformed output 502, redaction, cancellation/timeout bounds. Provider-enabled matrix **REQUIRES EXTERNAL SERVICE** and must not be run until deliberately configured. No key in client (`check:secrets` clean). |
| P7 testing | All runnable commands run (section 2). **BLOCKED:** `npm run test:e2e` (browser download), live scripts (network/credentials). |
| P8 documentation | This file, LAUNCH_AUDIT appendix, OPERATOR_RUNBOOK, README updated with real evidence only. |
| P9 release gate | `npm run check:release` **BLOCKED (exit 1)** with 9 blockers; approvals untouched; deletion switch `false`. |

## 5. Remaining human actions / launch blockers

1. **Run the live matrices from a credentialed machine with normal network**: `check:staging` →
   `test:live` → `test:live:storage` → `test:live:deletion` (record outputs privately).
2. **Deploy** migration `202609300001_deletion_receipts.sql` FIRST, then `delete-account`, then
   run the deletion matrix (it exercises the deployed receipt protocol).
3. **Configure hosted Auth** (Site URL, exact redirect allowlist incl.
   `proofpilot://auth/callback`, no wildcards, email confirmation, min password 8) and **SMTP**
   (sender, SPF/DKIM/DMARC) — dashboard/external service work; exact steps in the runbook.
4. **Re-run `npm run test:e2e`** where Chromium can be downloaded.
5. **Re-enable/verify nothing prematurely**: keep AI disabled, deletion disabled, approvals unset
   until each real review happens.
6. Device/store and legal reviews remain open exactly as previously audited (REQUIRES REAL
   DEVICE / REQUIRES HUMAN-LEGAL DECISION).

## 6. Exact next commands (credentialed machine)

```sh
npm ci
npm test -- --runInBand && npm run test:migrations
npx -y deno test supabase/functions/_shared/handlers_test.ts
npm run build:web && npm run check:secrets
# staging window (values in ignored .env.local or the process environment only):
npm run check:staging
npm run test:live
npm run test:live:storage
npm run test:live:deletion
# after the receipt migration + function are deployed:
npx playwright install chromium && npm run test:e2e
npm run check:release   # must stay BLOCKED until each approval is real
```
