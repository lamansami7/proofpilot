# FINAL RELEASE-HARDENING REPORT

> Subsequent user-authorized merge preparation and fresh exact-tree results are recorded in [MERGE_VERIFICATION.md](MERGE_VERIFICATION.md). The no-push/no-merge statements below describe the original audit stage; production blockers remain unchanged.

## Latest pass: local gate passed; public release remains blocked

Continued the existing checkout on `arena/01a0dd28-proofpilot`, preserving architecture, visual identity and version **1.0.0**. No deployment, hosted database/Auth/SMTP changes, credential collection, push or merge. PR #9 remains untouched by this pass.

This is **fresh verification after the repeated hardening request**, not reused evidence. Fresh `npm ci` and the starting **339 tests / 33 suites** passed before the changes below. The preceding report is preserved in [the historical 339-test report](reviews/RELEASE_HARDENING_339.md).

## Confirmed issues, fixes and regressions

| Issue / root cause | Fix | New or strengthened evidence |
| --- | --- | --- |
| Auth actions relied on rendered loading state, allowing same-frame duplicate submissions or competing sign-in/reset actions. | Synchronous request guards, mounted-state guards and noneditable pending inputs; recovery allows retry after failure. | Sign-in/reset and recovery deferred-promise regressions assert exact request counts and usable retry. These are local component tests, not hosted Auth verification. |
| Broad auth-error substring matching invented causes: “generate” matched “rate”; arbitrary signup errors meant registration was disabled. Recovery failure also asserted that a password had definitely not changed. | Narrow cause classifiers; preserve unrelated messages; report an unconfirmed password change without asserting server state. | Three classifier cases plus an explicit recovery-error assertion. |
| Blank or duplicate document/deadline IDs inside a purchase made targeted updates/removal ambiguous. Invalid mutation output could also poison a readable snapshot. | Validate scoped child identities when reading and validate candidate items before persistence/file-cleanup scheduling. Reject ambiguous records without rewriting originals; the same child ID in different purchases remains valid. | Six integrity cases verify rejected reads/writes, unchanged in-memory state and valid cross-purchase IDs. Two new browser cases assert the visible read failure and byte-for-byte unchanged localStorage. No destructive automatic repair was added. |
| A settings refresh or late save acknowledgement could overwrite an unsaved return-window draft; repeated Save callbacks could duplicate writes. | Track dirty state and edit revision; only refresh clean drafts; synchronous save guard. | Three lifecycle tests and a real two-tab browser regression, including explicit Save after the preserved draft. |
| A stale Vault removal was correctly rejected, but generic retry instructions led back to the same stale confirmation. | Explain that the user must choose **Keep document** and reopen confirmation. | Existing browser test now completes that recovery path and verifies successful removal while retaining the newer purchase name. |

Added **15 unit/component cases**, **3 browser cases**, and strengthened an existing browser regression. No tests were skipped, removed or weakened, and no test timeout was increased. An intermediate test-file editing error was corrected before the final gate; final results below are from the corrected source.

## Final verification

| Check | Final result |
| --- | --- |
| Unit/component/integration (`npm test`) | **354 passed / 35 suites** |
| TypeScript; ESLint | Passed |
| Migration checks | **26 passed** — local checks, not live application of migrations |
| Tooling compatibility | **5 passed** |
| Release-configuration tests | **9 passed** |
| Offline-shell test | **1 passed** |
| Deno edge tests; entrypoint type checks | **18 passed**; checks passed |
| Dependency audit (`npm audit`) | **0 reported vulnerabilities** |
| Production web build | Passed; 6 public shell assets, cache version `76f73b1faf70d2cf` |
| Expo all-platform export | Android, iOS and web exports passed; not signed builds or physical-device evidence |
| Complete E2E, first run | **56/56 passed — 4.0 minutes** |
| Complete E2E, immediately following run | **56/56 passed — 4.1 minutes** |
| `git diff --check` | Passed |
| Actual production release check | **Exit 1: RELEASE BLOCKED**, intentionally; requirements below remain unmet |

The full browser suite re-exercises purchase create/edit/restart/pin, bulk and stale deletion, claim/template lifecycle, document persistence and failure recovery, deadline actions, backup/settings, cross-tab conflicts, storage failures, offline/reconnect, dialogs, keyboard focus and accessibility checks. Auth/provider failure paths also have component and edge tests. Passing mocks and local checks do not verify hosted services.

Reproduction: run `npm run preview` on port 8080, then `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:migrations`, `npm run test:tooling`, `npm run test:release-config`, `npm run test:offline`, `npm run test:edge`, `npm run check:edge`, `npm audit`, `npm run build:web`, `npx expo export --platform all --output-dir .cache/release2/native`, and `npm run test:e2e` twice consecutively. Follow with `npm run measure:web`, `npm run check:release` and `git diff --check`.

This sandbox used external **Deno 2.5.6** and **Chromium 153.0.8010.0**. Chromium ran with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium` and `LD_LIBRARY_PATH=/tmp/al2023/lib`; these are environment setup, not repository dependencies.

## Visual, accessibility, security and performance review

- Actually inspected **11 fresh contact sheets** from the final second E2E run, covering **320, 375, 430, 768, 1024, 1280 and 1440 px**. Reviewed purchase layouts, form/errors, settings, claims, document loading/failure/restart, empty/error screens, long names and paginated Vault/Deadlines. Controls wrap and pagination remains reachable. Existing automated overflow, focus, Escape, scrolling and axe assertions passed.
- Limits: headless CJK fallback glyphs remain missing in the Unicode fixture; white one-pixel receipt fixtures establish loading/persistence, not legibility of real receipts. This is not physical-keyboard/virtual-keyboard, manual screen-reader or cross-browser certification.
- Rechecked storage locking/identity handling, file cleanup boundaries, AI transport/edge validation and offline caching alongside the existing regressions. The worker caches the public shell, not user records. Hosted AI remains unverified/unconfigured; generated guidance is not treated as trusted HTML or verified merchant policy.
- Heuristic scans of tracked/nonignored text found no matching private keys, provider/GitHub/AWS keys or JWT literals, no unexpected credential/temp paths, and no application debug statements or unsafe HTML/eval patterns. These scoped scans and a clean dependency audit are **not** a comprehensive security certification. Generated evidence and native exports remain ignored.
- Fresh-context local startup samples: **274, 318, 304, 298, 265 ms**; median **298 ms**.
- Synthetic **5,000 purchases / 1,000 documents / 1,000 deadlines**: Purchases click+paint **108 ms / 553 DOM elements**; Vault **129 ms / 871 elements**; Deadlines **129 ms / 752 elements**. One pin/save operation took **988 ms**, retaining all 5,000 records. These are single local UI measurements, not network/mobile benchmarks or demonstrated speed improvements. Whole-snapshot mutations remain comparatively expensive at this scale; low-end-device profiling is outstanding. The benchmark initially used the visible Pin text instead of its accessible name; correcting that harness selector produced the reported successful measurement.

## Files and evidence

Application changes in this pass:
- `src/components/authScreen.tsx`
- `src/components/settingsScreen.tsx`
- `src/components/vaultScreen.tsx`
- `src/lib/localPurchaseStore.ts`

Regression changes:
- `src/__tests__/authRequestLifecycle.test.tsx` — new
- `src/__tests__/settingsDraftLifecycle.test.tsx` — new
- `src/lib/__tests__/snapshotIntegrity.test.ts`
- `e2e/purchase-workflow.spec.ts`

Documentation: this report, the preserved historical report, README and launch-audit result pointers. Inherited changes remain intact. No runtime dependencies or lockfile changes were needed for this pass.

Ignored local evidence: `.cache/release2/` contains the final gate logs, separate `e2e-first` and `e2e-second` results, `visual-1.jpg` through `visual-11.jpg`, native exports, performance output and hygiene summary. Cache/temp evidence is environment-local and may not survive sandbox restoration; it is not a committed release artifact. The report preserves the measured results separately.

## Exact release blockers and unverified work

The current `check:release` requires:
1. A real public HTTPS `EXPO_PUBLIC_SUPABASE_URL`.
2. A real public HTTPS `EXPO_PUBLIC_PRIVACY_POLICY_URL`.
3. A public anon/publishable `EXPO_PUBLIC_SUPABASE_ANON_KEY`, never a privileged key.
4. A real private support contact in `EXPO_PUBLIC_SUPPORT_EMAIL`.
5. Deployment and genuine verification of account deletion before enabling `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED`.
6. Authenticated initialization of the actual EAS project.
7. Completed live verification before recording `PROOFPILOT_LIVE_VERIFICATION_APPROVED=yes`.
8. Completed device verification before recording `PROOFPILOT_DEVICE_VERIFICATION_APPROVED=yes`.
9. Completed legal verification before recording `PROOFPILOT_LEGAL_VERIFICATION_APPROVED=yes`.

**Account-deletion lost-confirmation recovery remains a launch blocker.** No successful hosted recovery or invented workaround is claimed. Supported secure secret injection and authorized, independently verified staging identity are still prerequisites to hosted operations; no credentials should be pasted into chat or committed files.

Still unverified: real Auth/email/recovery, RLS and Storage isolation, cloud synchronization, AI provider/quota behavior, account deletion including partial/ambiguous outcomes, production HTTPS/CDN/PWA installation/update behavior, physical native file/camera/share/notification APIs, manual screen readers, Safari/Firefox and representative low-end performance. Browser navigation remains state-based rather than shareable URL routing. Metadata backup is not binary-document backup.

**Conclusion:** the final local gate is green with stronger integrity and concurrency coverage. This is not approval to deploy, merge, enable hosted features or submit to Google Play.
