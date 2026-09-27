# FINAL RELEASE-HARDENING REPORT

> Historical 339-test pass, preserved for provenance. For current results, see [the latest report](../FINAL_RELEASE_HARDENING_REPORT.md).

**ProofPilot 1.0.0 · 2026-09-26 (America/Chicago) · `arena/01a0dd28-proofpilot`**

## Outcome

**Local validation passed. Production release remains blocked.** Fresh installation independently reproduced the 321-test baseline. This pass added **18 unit/component/integration cases and 10 E2E cases**, without replacing the architecture, removing tests, changing the version, or deploying anything. Earlier continuation work remains intact.

## Bugs discovered, root causes, fixes and regressions

| Confirmed problem | Root cause and targeted fix | Regression evidence |
|---|---|---|
| **Stale Vault deletion overwrites newer purchase edits** | Vault submitted a captured whole purchase without its expected baseline. Pass that baseline through the existing transactional conflict check. | Real two-tab test: newer name and document survive the stale deletion confirmation. |
| Corrupted IndexedDB Blobs remain downloadable | Reads checked Blob identity but not MIME or size. Revalidate supported MIME and non-empty/20 MB bounds on reads. | Three persisted-Blob cases; browser rejects HTML, SVG and empty Blobs, then downloads restored valid bytes exactly. |
| Preview path bypasses document URL/ownership policy | Direct image preview accepted arbitrary native file paths and unsupported data MIME types. Apply existing URL and app-owned-path rules. | Native-path and SVG-data preview regressions. |
| Duplicate/late viewer actions affect the wrong document | No synchronous operation guard or document revision ownership; clipboard timer survived unmount. Add operation ownership, disabled pending controls and timer cleanup. | Duplicate-action, delayed success/failure after document replacement, and actual timer-cancellation tests. |
| Invalid replacement backup leaves old restore confirmation available | Selection errors retained the previous parsed backup. Clear it after a replacement is selected; serialize picker requests and block confirmation during selection. | Component and real file-chooser E2E; original records remain unchanged. |
| Native export leaks temporary backup after sharing failure and races on one filename | Cleanup ran only after successful sharing; exports shared a filename and lacked a guard. Use unique temporary paths, synchronous guard and `finally` cleanup, with explicit cleanup-failure warning. | Rejected share, duplicate export, unique-path and cleanup-failure tests. |
| Successful late session restoration leaves timeout error visible | Success cleared loading but not a previously set timeout error. Clear the error on successful restoration while retaining auth-event precedence. | Deferred session result after the real 15-second threshold, using fake timers—not an increased timeout. |
| Large Vault/deadline collections render every row immediately | Unbounded mapping produced thousands of unnecessary elements. Render 50 rows per document section/deadline group initially, with explicit Show more controls; search still covers all entries. | Pagination/reveal/search tests and seven-width E2E; measured large-library comparison below. |
| Child IDs collide across purchases in React lists | Keys used a child ID without its purchase scope. Use composite purchase/child keys in Vault, Radar and dashboard rows. | Repeated child-ID fixtures, warning assertions, and assertion that dashboard deadline rows actually rendered. |
| Short Vault names become unreadable on narrow screens | Action controls squeezed the flexible text column to a few characters. Give text a minimum width so controls wrap instead. | Found by screenshot inspection despite green tests; new short-name truncation assertion at every requested width. |

Affected application files: `src/components/{vaultScreen,deadlineRadar,dashboard,documentViewer,settingsScreen}.tsx`, `src/hooks/useSession.ts`, `src/lib/browserDocuments.ts`.

## Final verification

| Check | Result |
|---|---|
| Complete Jest suite | **339 passed, 33 suites** |
| TypeScript / ESLint | **Passed**, no errors or warnings |
| Local migration/database/RLS checks | **26 assertions passed**; not hosted verification |
| Tooling / release-config / offline generator | **5 / 9 / 1 passed** |
| Edge handler tests | **18 passed** |
| Production edge entrypoint type checks | **Both passed** |
| Repository dependency audit | **0 reported vulnerabilities** |
| Production web build | **Passed**; six public offline assets, cache `ca739a9f3338f22f` |
| Native/web exports | **iOS, Android and web passed**; not compiled/signed/device-tested |
| Complete E2E, final run 1 | **53/53 passed**, approximately **3.3 minutes** |
| Complete E2E, final run 2 | **53/53 passed**, approximately **3.3 minutes**, immediately consecutive |
| Axe / keyboard / modal regressions | **Passed in tested Chromium scope** |
| `git diff --check` | **Passed** |
| Production release gate | **Blocked, exit 1**—not counted as a passing release check |

The complete gate and both browser runs were repeated after the screenshot-driven layout fix. An additional test-only dashboard assertion was subsequently strengthened to require actual rendered rows; Jest, TypeScript and lint passed again. No application change followed the final double E2E run. No tests were skipped, assertions weakened, or timeouts increased. Test-development failures included incorrect selectors/imports and mock cleanup; these were corrected in the tests rather than hidden with application workarounds.

Existing create/edit/delete/bulk/claim/assistant/template, settings, offline/reconnect, corruption, storage-clear, account isolation and browser-restart regressions all remain in the complete suites. AI tests use injected test services; they are not live-provider evidence. Native API mocks and exports are not physical-device evidence.

## Security and repository hygiene

- Newly strengthened stored-file MIME/size checks, native preview ownership, export-file cleanup and stale-write protection.
- Existing untrusted AI, URL, backup validation, local persistence and edge authorization/request-limit tests retained and rerun.
- Pattern scan of tracked and non-ignored candidate files found **no matching private keys, provider/GitHub/AWS credentials or JWT literals**. No unexpected credential/temp paths found. Values were not printed.
- Application-source scan found **no `console.log`/`console.debug`, debugger statements, unsafe HTML rendering or eval usage** in the scanned paths.
- Runtime tools, browser profiles, screenshots, exports and load fixtures remain in ignored/external directories. No runtime dependency added; no forced audit fix used.
- These checks do not establish absence of every vulnerability. MIME allowlisting is not antivirus scanning or independent verification of document contents.

## Visual and accessibility review

**Eleven final contact sheets were regenerated and actually opened and inspected.**

- **320:** home, purchases, populated form, validation, settings, empty/error states, long Unicode title, nested attachment/restart viewer, corrupt-file recovery, claim error/save state, Vault and Radar pagination.
- **375:** purchases, attachment preview/loading, nested dialogs, Vault and Radar pagination.
- **430, 768, 1024, 1280:** purchases plus Vault/Radar pagination and controls.
- **1440:** home, purchases, claim state, Vault and Radar pagination.

Short document names are now readable; actions and pagination wrap within the phone width. Additional rows on small screens are intentional. Long stored text remains intact. Pagination tests assert row counts, final-record searchability, button reachability, short-name truncation, overflow and axe results—not merely screenshot creation.

The receipt fixture is a tiny white PNG, not realistic receipt/OCR evidence. CJK glyph fallback remains incomplete in the sandbox. Browser clock/timezone may differ from the report's local date. Manual screen-reader, physical keyboard/device, orientation/zoom and Safari/Firefox certification were not performed.

## Performance results

Synthetic isolated browser context: **5,000 purchases, 1,000 document records and 1,000 deadlines**. No real user data used.

| Screen | Before: elements / click-to-paint | Final: elements / click-to-paint |
|---|---|---|
| Purchases | 553 / 95 ms | 553 / 88 ms |
| Vault | 14,169 / 845 ms | **871 / 109 ms** |
| Deadlines | 12,150 / 679 ms | **752 / 109 ms** |

These are individual local observations, not a statistically controlled production/mobile benchmark. The structural reduction in initial rendering is independently asserted by tests. Show more can still intentionally expand the full collection; this is bounded initial rendering, not a new virtualization architecture.

Five fresh-context startup measurements: **254, 244, 247, 253, 231 ms**, median **247 ms**. Clipboard timer cleanup and request/export guards also prevent avoidable retained work.

## Files changed in this pass

- Application: the seven files listed above.
- New tests: `src/__tests__/documentViewerLifecycle.test.tsx`, `backupFileLifecycle.test.tsx`, `largeLibrary.test.tsx`.
- Extended tests: `src/__tests__/sessionLifecycle.test.tsx`, `src/lib/__tests__/browserDocuments.test.ts`, `e2e/purchase-workflow.spec.ts`.
- Documentation: this report, README, launch audit and a latest-report pointer in the previous engineering review.

The wider Git diff includes earlier continuation work and is not all newly authored here. No reset, destructive cleanup, push, merge, deployment, hosted migration, production-data change or credential creation occurred.

## Unverified work and exact production blockers

**Do not treat the local result as approval for a public cloud-enabled launch.**

1. Independently verify **lost account-deletion response / unknown confirmation recovery**. Local tests do not prove hosted account state or a working production recovery route.
2. Configure genuine public Supabase URL and anon/publishable key, privacy-policy URL and private support contact. No privileged key belongs in the client.
3. Deploy and genuinely verify the deletion service before enabling account deletion—outside this unauthorized local pass.
4. Establish the real EAS project identity and perform signed install/device acceptance.
5. Complete genuine live, device and legal reviews; do not set approval flags as substitutes for evidence.

Still unverified: hosted Auth/email/recovery, RLS/Storage, cloud conflict/reconnect behavior, real AI/quotas, production CDN/service-worker update/install behavior, native picker/share/SecureStore/deep links, interruption during OS sharing, storage eviction, manual screen-reader and cross-browser behavior. A secure private credential-injection method has not been established here; chat/Git are not workarounds.

Existing limitations remain: browser Back/Forward/shareable application routes are not implemented as a full router; JSON backup excludes attachment binaries; local conflict guards are not a hosted multi-device version policy.

## Reproduction and evidence

Run from the repository root with Deno and a compatible Chromium installation. This run used Deno 2.5.6 and Chromium 153.0.8010.0, provisioned outside runtime dependencies.

```sh
npm ci
export PATH=/home/user/.cache/proofpilot-review-tools/node_modules/.bin:$PATH
export LD_LIBRARY_PATH=/tmp/al2023/lib
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium
npm test
npm run typecheck
npm run lint
npm run test:migrations
npm run test:tooling
npm run test:release-config
npm run test:offline
npm run test:edge
npm run check:edge
npm audit
npm run build:web
npx expo export --platform all --output-dir .cache/hardening/native
npm run test:e2e -- --output=.cache/hardening/e2e-first
npm run test:e2e -- --output=.cache/hardening/e2e-second
# With npm run preview serving on 8080:
npm run measure:web
git diff --check
npm run check:release # exits 1 until genuine prerequisites are met
```

The environment-specific overrides can be omitted with a standard Playwright browser installation. Tool provisioning commands are recorded in the preceding engineering report. Current ignored evidence is under `.cache/hardening/`: command logs, two screenshot sets, eleven contact sheets, hygiene scan and large-library measurements/script. Ignored artifacts and `/tmp` tools may not survive environment replacement. No live-test/deployment command is part of this sequence.
