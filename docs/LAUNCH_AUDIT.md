# FINAL LAUNCH AUDIT — ProofPilot 1.0.0

Date: 2026-09-26. Branch: `arena/01a0dd28-proofpilot`. PR #9 remains draft and unmerged. This report supersedes the earlier hardening-increment audit. **NOT SAFE TO SHIP as a public cloud-enabled product.** No production service, SMTP, AI provider, signed store build or physical device was verified. Work is not represented as complete production transformation.

## 1. Changes — FIXED

Continued beyond the initial hardening increment: server AI/deletion handlers, service-control migration and quotas, native PKCE callback handling, durable managed-file cleanup and orphan inventory, real JSON sharing, tab-safe local transactions, native network/resume handling, public-only offline shell, keyboard/dialog accessibility, responsive layouts, original app assets, EAS profiles, compatibility patches and operator verification/release scripts. Version stays 1.0.0. No fabricated integrations or automatic sample records.

## 2. Verified evidence — VERIFIED (local scope only)

Clean `npm ci` applied all four patches. Real PostgreSQL-compatible PGlite migration tests, Chromium browser interactions, Deno handler tests, strict TypeScript, production web export, all-platform JS/Hermes exports and both-platform native prebuild executed. Native generation used an ignored copy of the managed project with installed dependencies and Expo SDK 52 template; no generated native directories are shipped here. These are not substitutes for hosted Supabase or device evidence.

## 3. Test counts — VERIFIED

| Check | Latest result |
|---|---|
| Full Jest | 248 tests, 20 suites passed |
| Embedded PostgreSQL/RLS | 26 assertions passed |
| Deno handler tests | 11 passed |
| Deno production entrypoint checks | Both passed |
| Tooling compatibility | 5 checks passed |
| Playwright Chromium | 19 passed |
| TypeScript incl. unused locals/parameters | Passed |
| Web production export + offline shell | Passed |
| iOS/Android bundle export and project prebuild | Passed; not compiled/signed |
| Clean install / npm audit | Passed / 0 reported vulnerabilities |
| git diff whitespace check | Passed |
| Live staging script | Refused without credentials/opt-in; NOT a live pass |
| Release gate | Correctly blocked missing configuration/approvals |

## 4. Security — FIXED; hosted validation REQUIRES EXTERNAL SERVICE

RLS isolation, deletion-wins tombstones, account-bound sync credentials, native SecureStore auth persistence, exact PKCE callback parsing, bounded restore/file inputs, conservative original-file protections, strict server identity checks, redacted backend errors and private server keys. File cleanup now fails closed on corrupt caches. No provider secret embedded in client. Local records are not encrypted by the app. Browser sessions and local records remain exposed to a compromised/shared browser profile. No independent penetration test, malware scan, historical secret audit or compliance certification performed.

## 5. Database — VERIFIED locally; REQUIRES MY CONFIGURATION

Four ordered migrations include read-only categories, account-closing write freeze, Storage prefix controls, purchase-data validation and atomic quota reservation. Embedded harness covers ownership/RLS, idempotency, tombstones and malformed writes; it uses minimal Auth/Storage schemas, not real hosted services or concurrent DB sessions. Apply migrations before clients. Real two-account verification and two-device conflict tests remain mandatory.

## 6. Authentication and deletion — REQUIRES EXTERNAL SERVICE; failure recovery NOT SAFE TO SHIP

Email confirmation, web recovery, native PKCE callback validation and recent-password deletion flows implemented. SMTP, redirect allowlists and installed-app flows unverified. Deletion removes owned Storage before Auth; failed cleanup retains retry intent. Local confirmed purge retries are durable. Unconfirmed ledgers block normal UI rather than report success.

**Remaining integrity/usability risk:** server deletion can succeed while its response or the client's confirmed-ledger write is lost. A deleted account cannot reauthenticate to retry; the app cannot independently infer success. Private support must verify server state, then the user must explicitly clear local app/site data after preserving other accounts' originals. There is no automatic verified recovery protocol for that case. Offline caches on other disconnected devices are not remotely erased. Do not enable customer account deletion until this recovery/support process is tested and approved; a durable server receipt protocol would be preferable. This is a real unresolved release issue, not a passed local test.

## 7. AI — FIXED backend implementation; REQUIRES EXTERNAL SERVICE

Optional Edge Function authenticates JWT with Auth, validates minimized context, reserves quotas (3/min, 20/day/account, 200/day deployment), bounds upstream work and propagates cancellation/timeouts. Disabled by default. Server-only provider key/model/billing and retention review required. Eleven handler tests include AI and deletion paths but use injected dependencies, not a live provider. Outputs remain unverified; no OCR or automatic claim submission.

## 8. Browser and design — VERIFIED Chromium subset

19 tests cover seven widths: 320/375/430/768/1024/1280/1440; real create/pin/edit/reload/delete, five main screens, nested dialogs, real IndexedDB file attachment/preview/export/delete/restore, concurrent two-tab saves, arrow-key navigation and offline reload. Automated screenshots and axe scans captured. Manual review of main-screen contact sheets at 320/768/1440 and earlier full Home/Settings narrow screenshots found and fixed squeezed headings and overflowing sort controls; heading dimensions now have regression assertions. This is not exhaustive manual review of every scrolled section/auth/error state. Firefox, Safari, actual Chromebook, zoom/large text and deployed-origin service-worker update behavior remain unverified.

## 9. Mobile/native — REQUIRES REAL-DEVICE TESTING

Original icon/adaptive/splash/favicon included. Android and iOS project generation and Hermes exports passed. No APK/IPA was compiled, signed, installed or run. Test camera/gallery/document picker, permissions, SecureStore, network transitions, lifecycle, recovery deep links, sharing/temporary-file deletion, orientation, safe areas, large text and VoiceOver/TalkBack. Generated Android permissions need release review, including inherited storage/overlay/vibration permissions. Old Expo SDK eligibility is not proven.

## 10. Performance — VERIFIED limited measurement

Observed web export approximately 911 kB uncompressed JS plus 56.2 kB font, versus earlier approximately 1.31 MB JS with broader font loading. Five fresh local Chromium contexts measured app startup 204–228 ms, median 213 ms (pre-final layout edits). Local static server/headless browser only: not Core Web Vitals, slow-network, large-account or device benchmarks. No remote performance claims.

## 11. Accessibility — FIXED / VERIFIED automated subset

Keyboard tab navigation, Escape/focus return, modal containment, nested-modal ARIA patch, labeled controls, reduced motion and contrast corrections. Populated main screens and nested preview have zero violations under the configured axe WCAG 2 A/AA and 2.1 AA tags in tested flows. Automated axe does not establish WCAG conformance. Screen reader and real-device large-font review REQUIRES REAL-DEVICE TESTING.

## 12. Dependencies — VERIFIED audit; release compatibility REQUIRES REAL-DEVICE TESTING

Clean install audited 1,141 packages with zero reported vulnerabilities; four explicit adapters applied. No force-fix. See DEPENDENCY_SECURITY.md for pinned versions and patch rationale. Native prebuild validates only generation, not runtime/store acceptance. Current store SDK/API rules and supported Expo upgrade planning remain open.

## 13. Privacy/legal — REQUIRES MY CONFIGURATION

Technical disclosure updated with metadata-only backup, local attachment retention, cleanup, AI limits and account-deletion uncertainty. Configurable HTTPS privacy link/private support email; unavailable state otherwise. Operator identity/contact, lawful disclosures, regions, retention/backup erasure, provider terms, independent web deletion route, legal approval and operational support are not supplied. Draft must not be published as final policy.

## 14. Store release — REQUIRES MY CONFIGURATION / REQUIRES REAL-DEVICE TESTING

EAS preview/production profiles and native build identifiers prepared. Actual EAS project/signing credentials, package ownership, current target API/Apple SDK compatibility, reviewed permissions, release screenshots/feature graphic, store metadata, privacy/Data Safety declarations and store review remain outstanding. No submission performed.

## 15. Exact remaining blockers

| Blocker | Classification |
|---|---|
| Hosted project, migrations, Auth/SMTP redirects and monitoring | REQUIRES MY CONFIGURATION |
| Live RLS/Storage, multi-device conflicts, email and deletion tests | REQUIRES EXTERNAL SERVICE |
| Lost deletion response/confirmation-ledger recovery and other-device cache expectations | NOT SAFE TO SHIP |
| AI provider deployment/billing/retention and real failure tests | REQUIRES EXTERNAL SERVICE |
| EAS project, signing/accounts, policy/support and store declarations | REQUIRES MY CONFIGURATION |
| Native runtime, permissions, lifecycle, assistive technology | REQUIRES REAL-DEVICE TESTING |
| Store target/API/SDK compatibility and signed acceptance | REQUIRES MY CONFIGURATION |
| Full cross-browser/scrolled-state design review, deployed SW lifecycle and independent security review | NOT SAFE TO SHIP until release review closes coverage gaps |

Features absent by design, not falsely promised: notifications, OCR, document-binary cloud backup, payments. Keep independent originals; metadata exports do not restore attachment contents.

## 16. Exact commands operator runs

See [OPERATOR_RUNBOOK.md](../OPERATOR_RUNBOOK.md): reproducible tests; Supabase login/link/migration dry run/push; function secret/deploy commands; `npm run test:live`; EAS initialization/preview/production builds; `npm run check:release`. The runbook supplies the manual live failure-injection and two-device matrix. Never apply migrations blindly to production or bypass approvals merely to make a gate green.

## 17. Exact configuration and credentials required

Public build variables: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED, optional EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT, EXPO_PUBLIC_PRIVACY_POLICY_URL, EXPO_PUBLIC_SUPPORT_EMAIL. Server-only: ALLOWED_ORIGINS, AI_ENABLED, AI_MODEL, OPENAI_API_KEY; hosted Supabase injects service URL/role key. Operator tooling: Supabase project ref/access/database credentials, SMTP sender credentials, two dedicated staging account emails/passwords, Expo/EAS ownership/login, Android keystore/Play Console and Apple signing/App Store Connect access. Required legal/operational facts and exact environment names are in the runbook. Configure privately; do not paste secrets into chat.

## 18. Is PR #9 safely mergeable?

**Not approved as a production-launch merge. Keep draft/unmerged.** Local-only review/staging work has substantial passing evidence, but hosted migrations/services, uncertain deletion recovery, native/store compatibility and legal/support gates remain. A maintainer could separately approve a staging-only merge after reviewing the complete patch and deployment dependencies; that is not this audit's authorization. No merge or store submission was performed. Obtain live/device evidence and resolve the listed unsafe paths before a production-readiness claim.
