# ProofPilot 1.0.0 — Final local master pass

> Historical pass retained for traceability. See [the subsequent senior engineering review](FINAL_ENGINEERING_REVIEW.md) for the current 304-test / two 35-test E2E results.

**Date:** September 26, 2026

**Branch:** `arena/01a0dd28-proofpilot`

**Disposition:** Local validation passed. **Not certified or approved for public cloud-enabled release.**

## 1. Scope and preservation

Continued the existing Expo project and its pre-existing uncommitted continuation. No architecture replacement, version bump, repository reset, cloud modification, migration deployment, QA-account creation, push, or PR merge. Existing server implementations and release gates remain intact. A source baseline archive was made outside the repository before edits; it is a local convenience, not an off-container backup.

Review concentrated on cross-cutting persistence, settings, account isolation, asynchronous purchase/file operations, file cleanup, offline generation, responsive collection controls, shared accessibility primitives, build/dependency configuration and their tests. This report does not claim exhaustive line-by-line certification, every possible interleaving, or physical-device verification.

## 2. Root-cause changes

| Area | Defect and resolution | Regression evidence |
|---|---|---|
| Deletion outbox | A repeated delete could cancel a queued cloud tombstone. Repeat deletes now preserve it until acknowledgement. | Store mutation unit test |
| Stale edits | Saving an old record could revive a pending deletion or recreate a deleted guest record. Tombstone conflicts now reject; edit/update paths require an existing record and display an actionable conflict. Restoration still uses new IDs. | Unit tests and real two-tab deletion/edit E2E |
| Corrupt caches | Tolerant migration could silently discard malformed records, document references or deadlines on the next write. Cache reads now reject these losses, duplicate purchase IDs and malformed queues; valid legacy optional fields still migrate. | Snapshot integrity tests; browser corruption E2E |
| File cleanup | Malformed document references could be ignored during reference scanning. Cleanup now fails closed instead. | Cleanup tests |
| Settings | A tab merged updates against stale in-memory settings. Updates now reread/merge/write under the shared Web Lock, preserve unrelated settings, refuse corrupt caches, and refresh on storage events/native resume. | Hook tests and real two-tab propagation/reload E2E |
| Native startup | React Native's global `window` does not imply DOM event methods. Purchase-store browser subscriptions are now web-only; native AppState/NetInfo behavior remains. | A native hook test reproduced the crash before the guard and passes after it |
| File picker and save lifecycle | Delayed picker/camera results could populate a subsequent form. Results are generation-bound; save activation has a synchronous duplicate guard. Abandoned managed copies remain eligible for the existing age-gated orphan maintenance rather than deleting originals blindly. | Closed/reopened picker and duplicate-save component tests |
| Offline build | Hashing only HTML missed fixed-name asset changes. The hash now includes sorted asset names and bytes. A repeat-generation regression also caught self-inclusion of the generated worker; it is excluded. | Deterministic repeat-generation and changed-asset test; offline reload E2E |
| Phone collection | Expanded sort/filter controls pushed records below the first screen. Phones now have an accessible expandable filter panel; choices survive collapse. Desktop controls remain expanded. | First-record viewport assertions at 320/375/430px; keyboard/expanded-state/filter-retention E2E |
| Search recovery | The no-results action reset filters but left the search active. It now clears both when connected to application search. | Browser search-clear regression |
| Tooling/types | Added a real ESLint command/configuration, removed unnecessary `any` casts, typed icon/skeleton props, and retained existing assertions. | ESLint and TypeScript |

No test suite was deleted or skipped. The old assertion that an upsert revives a tombstone was replaced with stronger deletion-wins assertions because that was the defective behavior. Two screen tests now open the phone disclosure before checking the same existing controls. A new browser test locator was scoped to the active dialog after strict mode correctly detected both the background and dialog error text; no timeouts or retries were increased.

## 3. Final verification — VERIFIED LOCALLY

The final application source passed this order: **web build → TypeScript → lint → unit/integration and supporting tests → complete E2E → complete E2E again**. Only documentation was edited afterward.

| Check | Final result |
|---|---|
| Web export + public offline shell | Passed |
| TypeScript | Passed |
| ESLint | Passed; zero errors/warnings |
| Jest | **283 tests / 25 suites passed** |
| Embedded PGlite migration/RLS assertions | **26 passed**; no hosted database touched |
| Compatibility tooling | **5 passed** |
| Release/staging configuration tests | **9 passed** |
| Offline-shell generator | **1 passed** |
| Deno handler/HTTP tests | **18 passed** |
| Deno production entrypoint typechecks | Both passed |
| Complete Chromium E2E, first final run | **31 passed**, approximately 1.8 minutes |
| Complete Chromium E2E, second final run | **31 passed**, approximately 1.9 minutes |
| Dependency audit | **0 known vulnerabilities reported** |
| iOS, Android and web exports | Passed; includes native JS/Hermes bundles, not signed native builds |
| Git whitespace/diff check | Passed |

Browser coverage includes all requested widths: **320, 375, 430, 768, 1024, 1280, 1440**. At each width, existing create/pin/edit/reload/delete/navigation flows and selected axe WCAG A/AA scans pass. Empty/form-error/cleanup-recovery tests also run at all seven widths. Other tests exercise focus containment/restoration, Escape/nested dialogs, arrow-key navigation, file capture/export/restore/cleanup, simultaneous local saves, offline reload, corrupt-cache preservation, and settings propagation.

A dedicated test closes a persistent Chromium context/browser, opens a new one using the same profile, finds the purchase, opens its IndexedDB attachment and verifies downloaded bytes equal the original PNG fixture. This is stronger than a page reload, but is not mobile OS eviction, browser-data clearing, or native-device evidence.

**Performance:** five fresh local headless-browser contexts produced a median UI-ready time of **261 ms**, with individual runs of 237, 261, 288, 274 and 251 ms. This is a local static-server measurement, not an internet, low-end-phone, memory, battery or field-performance benchmark.

**Environment failures distinguished:** the standard Playwright CDN download failed with `ECONNRESET`. An isolated npm-provided Chromium 153.0.8010.0 runtime and its libraries enabled actual tests, without changing browser expectations or adding browser binaries to project dependencies. Deno was also installed outside the project. The first final sequence stopped on the offline-generator regression; the generator was fixed, and the full final sequence was rerun. An intermediate 30-test double pass was superseded by the final 31-test double pass after the phone-layout improvement.

Runtime logs and screenshots are under `.cache/master-pass/`, with separate `e2e-1` and `e2e-2` directories. They are ignored, disposable execution artifacts and may not survive environment replacement. This report preserves the result summary in source control; it is not a substitute for those raw artifacts.

## 4. Visual, accessibility and security review

Representative screenshots were actually viewed: 320px home/settings/collection, the improved 320px collection, 320px validation and nested document dialogs, 768px collection, and 1440px home. The phone collection now places the first purchase in the initial viewport; tablet/desktop layouts retain the established sidebar and design system. The white thumbnail in the restart test is a deliberately tiny fixture, not a real receipt preview assessment.

Keyboard/axe checks cover the tested local flows, not all assistive technologies. Disclosure buttons expose expanded state on native and web. No assertion here constitutes screen-reader, contrast-in-every-state, zoom, localization, or device certification.

No secrets were requested, printed or introduced. AI remains unavailable without configured services. Document originals are not presented as cloud-backed; exports remain metadata plus inline claim text, not binary backups. Corrupt caches are preserved rather than automatically replaced. Existing authentication, provider and account-deletion boundaries were not weakened to obtain green local tests.

## 5. Release blockers and unverified boundaries

`npm run check:release` still exits unsuccessfully, as intended. Passing its configuration tests is **not** passing the release gate.

- **REQUIRES CONFIGURATION:** verified public Supabase URL/key, public privacy-policy URL, support address, actual EAS project, deployed/verified account-deletion service.
- **REQUIRES EXTERNAL SERVICE:** hosted Auth/email/recovery, database/Storage policies, multi-device synchronization, AI provider/quotas and independently verified staging identity. No live acceptance script was run.
- **REQUIRES EXTERNAL SERVICE:** the lost account-deletion response/unknown confirmation remains a launch blocker. Local marker handling and handler tests do not resolve it.
- **REQUIRES REAL DEVICE:** native camera, picker, sharing, SecureStore, deep links, keyboard/safe areas, lifecycle/OS interruptions, offline recovery, signed builds and installation. Native exports are not substitutes.
- **REQUIRES HUMAN/LEGAL DECISION:** privacy/support ownership, legal approval, retention policy and launch sign-off.
- Cross-browser coverage beyond the local Chromium runtime, manual screen-reader verification, production network/performance/load testing and all possible concurrency/crash scenarios remain unverified.

No verified private-secret injection mechanism was established in this Arena environment. Do not put credentials in chat, attachments, source files, or Git to bypass that boundary.

## 6. Handoff

The local ProofPilot preview is served on port 8080, bound to `0.0.0.0`. The app remains version **1.0.0** and is useful in honest local-device mode. PR #9 has not been pushed, merged, or otherwise changed by this pass.

Ordinary reproduction with installed browser/runtime prerequisites:

```sh
npm ci
npm run build:web
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:migrations
npm run test:tooling
npm run test:release-config
npm run test:offline
npm run test:edge
npm run check:edge
npm run test:e2e
npm run test:e2e
npm audit
```

Deno must be on PATH. Install a supported Playwright browser in the execution environment, or use the existing `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override with its required libraries. Do not assume this pass's `/tmp` paths persist. Hosted verification requires a separately approved, securely authenticated operator environment; do not run `test:live`, migrations or deployments as part of the credential-free local checks above.
