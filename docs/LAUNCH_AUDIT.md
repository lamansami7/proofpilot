# ProofPilot 1.0.0 — launch audit / hardening increment

Date: 2026-09-26. Baseline: `3e7b2c3682380fe749b0171f08c5d42bd23a3d39`.
Branch: `arena/01a0dd28-proofpilot`. Public version remains **1.0.0**.

## Decision: NOT READY for public launch

This work is a prioritized security/data-integrity increment, not completion of every item in the master directive. No production service was deployed, no real customer account was created, no production migration was applied, and no store release was built. No Supabase/AI environment configuration was available. Changes are intended for review/staging before merging.

The exact resulting commit is provided in the handoff; `git rev-parse HEAD` reproduces it. Changed files are available with `git show --stat HEAD` and `git show --name-only HEAD`.

## Implemented

1. Empty initial storage for new users; no automatic demonstration records. Sample loading is development-only; pre-existing records remain untouched and legacy samples can still be identified/cleared.
2. Permanent server tombstones; deletion-wins reconciliation removes stale cached records and queued stale uploads. Deletion guards cover RPC and direct-table writes. Retry after interrupted deletion does not revive an ID. Restore uses new IDs.
3. Cloud record/tombstone pagination rather than relying on Supabase's default row cap. A sync attempt captures its account's JWT so a later account switch cannot upload the old outbox as a different user.
4. Legacy household purchase reads disabled until an explicit sharing/consent feature exists. Document metadata re-parenting restricted to owned purchases.
5. Native auth token persistence through Expo SecureStore, not AsyncStorage. Session restoration uses the cached session for offline UI, handles failures/timeouts, unsubscribes on unmount, and gives auth events priority over stale initialization. Sign-out checks returned provider errors. Account changes close old editors and reset navigation.
6. Web recovery-email request and password-update UI. Email/redirect service delivery is not verified. Native recovery gives an explicit unavailable message.
7. Schema-versioned metadata export; strict, bounded JSON restore with confirmation, duplicate/date/price checks, new IDs and removal of all imported file locations. Append is one serialized local snapshot write.
8. Attachment size checks on native and web; supported-extension/MIME checks; native deletion restricted to generated filenames in the app document directory. This is not malware scanning or content-signature verification.
9. Preserve record properties (including pinned state) when editing purchases.
10. AI transport requires HTTPS and a user JWT, rejects redirects, bounds requests, keeps the timeout active while reading responses, and surfaces rate-limit failures without billable automatic retries. Default context no longer includes serial numbers/private notes. No AI backend is included or connected.
11. Corrected unsupported privacy/connection/reminder claims and public-support export advice. Account deletion is explicitly unavailable in Settings. Added a technical privacy draft and dependency review.
12. Targeted PostCSS patch override, PostgreSQL migration harness, authentication/backup/document/deletion/AI transport regression tests, and seven-width browser smoke-test scaffolding.

## Verification performed

| Check | Result |
| --- | --- |
| Baseline Jest | 191 tests passed |
| Current Jest | 228 tests / 16 suites passed |
| PostgreSQL migration harness | 13 assertions passed |
| `tsc --noEmit` | Passed |
| `tsc --noEmit --noUnusedLocals --noUnusedParameters` | Passed |
| `expo export --platform web` | Passed; approximately 1.31 MB uncompressed JS plus font assets |
| `git diff --check` | Passed |
| npm audit | 19 findings: 13 moderate, 5 high, 1 critical (baseline 20) |
| Playwright | **Blocked / 7 launch failures**: Chromium download failed with network ECONNRESET; no browser assertions executed |
| Manual visual, keyboard, screen reader, Chromebook | **Not performed** |
| Native release / real device / secure token persistence | **Not performed** |
| Live Supabase, email, cross-device concurrency, Storage | **Not performed** |
| Real AI provider | **Not connected** |

The SQL harness is real embedded PostgreSQL (PGlite), with minimal test Auth/Storage schemas and roles. It applies all migrations, omitting only unavailable `pgcrypto` extension registration (`gen_random_uuid()` is built in). It verifies A/B read/write isolation, idempotency, tombstone visibility/permissions, stale resurrection rejection and account cascading. It does **not** run Supabase Auth/Storage services, production default grants, email delivery, multiple concurrent database connections or a production RLS penetration test.

Source searches for TODO/FIXME/mock/demo/placeholder/fake/example/hardcoded/console.log found test doubles/fixtures, form hints, legacy sample handling, and preview/test command logging. No fabricated AI fallback was found. Targeted secret-pattern scanning found no provider keys/private-key blocks in tracked source; this is not a full historical secret scan. No credentials were requested or stored. Product render tests are not visual accessibility certification.

## Launch blockers / remaining risks

### Security, accounts and data integrity

- Configure a **staging** Supabase project, apply all three migrations, verify actual RLS grants for anon/A/B on every owner table and Storage path, then test production configuration separately.
- Verify email signup/confirmation, invalid credentials, expired/revoked sessions, recovery redirect and real SMTP delivery. Set real allowed redirect URLs and email rate limits. Native recovery/deep links are missing.
- Implement verified self-service account deletion: auth user, database rows/tombstones, storage files, current-device records/token/cache cleanup; decide offline-device behavior. Current delete-all only removes purchase records/queues cloud deletes. Sign-out retains account-scoped data locally.
- Multi-device concurrent edits still use last successful write, without optimistic revisions/conflict UI. Permanent deletion intentionally discards queued stale edits. Historical remote deletions before tombstones cannot be reconstructed. Paginated reads are not a transactional multi-page snapshot; re-sync is needed during concurrent churn.
- Native reconnection detection is not implemented; browser online events and explicit retry exist. Automatic backoff/background synchronization is not implemented. Multi-tab local writes can still race; the serialized queue is per mounted store, not a cross-tab lock.
- Legacy local migration remains tolerant and can omit malformed fields. It is not a repair/recovery tool for arbitrary corrupted storage.
- Remaining critical/high dependency findings require a tested Expo/React Native upgrade or explicit reviewed containment. See DEPENDENCY_SECURITY.md.

### Documents

- Binary storage is local-only. No upload integration is used; the old upload helper/private bucket foundation is not a cloud-backup service.
- No comprehensive orphan inventory, durable failed-deletion queue, duplicate-content detection, or purchase/account-delete file cleanup. Canceling attachment flows can leave copies. Keep originals.
- Native opening/sharing via Linking is not verified and may fail for private file URIs. Browser MIME/extension checks are not file-content scanning. File-size metadata is not consistently persisted/displayed. Not all promised document lifecycle requirements are finished.
- JSON exports include sensitive record/claim text but no binaries; native Share may not produce a reusable `.json` file on every platform. Recovery from an actual browser/device loss must be rehearsed.

### AI, OCR, reminders

- **AI backend is absent.** Required architecture: client JWT → authenticated operator backend/Edge Function → provider secret. Must implement server-side schema validation, persistent quotas, abuse protection, bounded output, provider budget limits, cancellation/timeouts and redacted logs. Client limits alone are not abuse protection. Keep endpoint blank until tested. No automatic retries.
- Optional AI context still includes document names/model/merchant; review minimization and provide actual provider disclosure/consent. No document bodies are sent. User-entered questions can themselves contain sensitive data.
- OCR/receipt extraction is unavailable. Attaching a receipt does not scan/extract it.
- Notifications are unavailable despite the installed Expo plugin. Deadline Radar does not send reminders. Native scheduling/permission/rescheduling/timezone tests and web notification architecture remain undone.

### UX, accessibility, stores and legal

- Complete manual testing of all major screens at every requested width, actual keyboard/tab order, nested dialog focus containment/Escape, screen readers, errors, reduced motion, 44px targets and contrast. Browser tests are not yet run; they only cover basic empty navigation, not complete purchase flows.
- No measured startup timing or large-data stress benchmark. List pagination exists; virtualization needs measurement. The web export includes many icon-font assets; no performance claim is made.
- No Android/iOS release artifacts, signing, EAS project/build config, icon/splash artwork, versionCode/buildNumber, store screenshots, content rating or privacy/data-safety declarations verified. Existing bundle/package identifiers are `com.proofpilot.app`; ownership/availability must be checked.
- Privacy draft requires real operator/contact/retention/regions/provider decisions and legal review. No final terms of service or private support channel. No monetization implemented.
- No deployed production observability. Add redacted request IDs/error categories without record contents, tokens or documents; define operational response and restore drills.

## Commands: local and build

```bash
npm ci
cp .env.example .env
# Set only the public project URL/key, or leave empty for local-only operation.
npm start
npm test -- --runInBand
npm run test:migrations
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/tsc --noEmit --noUnusedLocals --noUnusedParameters
npx expo export --platform web
npm run preview
# Requires a successfully installed browser, and a LOCAL-ONLY web export:
npx playwright install chromium
npm run test:e2e
npm audit
git diff --check
```

## Deployment sequence (gated; not executed)

1. Create staging Supabase through the operator's authenticated console; enable strong Auth settings and controlled email delivery. Never add a service-role key to Expo configuration.
2. With the Supabase CLI installed/authenticated outside chat, use `supabase init` (this checkout does not yet include CLI config), `supabase link --project-ref YOUR_STAGING_PROJECT_REF`, then `supabase db push --dry-run`. Inspect migration history. Back up any existing database. Run `supabase db push` only against the explicitly confirmed target.
3. Required migrations in order: `202609230001_initial_schema.sql`, `202609250001_atomic_purchase_records.sql`, `202609260001_deletion_integrity.sql`. Existing projects apply only missing migrations. Do not re-run initial schema SQL manually over live tables. Migration 3 must precede the new client. Historical shared-household data needs owner review before its access is restricted.
4. Run the live two-user test plan above, including RLS on all tables/storage; interrupt saves/deletes; edit/delete offline on separate devices; switch accounts during sync; reconnect and verify deletion wins. Verify schema limits match client data and no file URI is uploaded. Exercise >1,000 records, local quota failures and backup/restore.
5. Complete account deletion/file lifecycle/security blockers. Publish a finalized privacy policy and private support contact. Deploy/test AI only if enabled; otherwise keep its variable empty. Do not claim reminders/OCR.
6. Set the three documented `EXPO_PUBLIC_*` values as appropriate in the hosting build environment; run `npm ci`, checks and `npx expo export --platform web`. Host only `dist/` over HTTPS on the chosen static host. The host is not selected/configured here; therefore exact provider-specific deployment commands cannot honestly be supplied. Add appropriate security/cache headers and review third-party connections/CSP against the actual build.
7. Add the exact HTTPS app origin to Supabase Site URL/redirect allowlist. Test signup/recovery on that real origin, logout/session expiration, two accounts and cold restart. Use staging first; review backups/migration order before repeating on production.
8. For native publishing, configure the actual EAS project/owner and release profiles, validate identifiers/permissions/privacy manifests/icons, then use authenticated EAS release builds and real-device QA. Do not submit a dev-server build. No exact signing/store-submit command is provided without that configuration.
9. Perform accessibility/responsive and performance tests, audit deployed security headers/provider logging/retention, and conduct a restore/deletion drill. Obtain an explicit launch decision from the owner. **Do not merge or publish merely because unit tests pass.**
