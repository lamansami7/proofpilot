# ProofPilot 1.0.0

ProofPilot organizes purchase records, local receipt files, user-entered return and warranty dates, and reviewable claim drafts. Expo / React Native / TypeScript, with optional Supabase account synchronization.

**Release status: NOT approved for public launch.** See [the launch audit](docs/LAUNCH_AUDIT.md) for verified work and unresolved release gates. A successful web export does not verify deployed services or native releases.

## Run locally

```bash
npm ci
cp .env.example .env
npm start
```

Leave integration variables empty for local-only operation. A fresh installation starts empty. Previously saved records are retained; sample loading is restricted to development builds. Production builds do not offer sample loading. Do not use samples as customer data.

```bash
npm test -- --runInBand
npm run test:migrations
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/tsc --noEmit --noUnusedLocals --noUnusedParameters
npm run build:web
npm run preview
```

The preview serves `dist/` on `0.0.0.0:8080`. Development commands for native platforms: `npm run android`, `npm run ios`. These are **not signed release builds**.

Browser smoke tests (local-only export required):

```bash
npx playwright install chromium
npm run test:e2e
```

The tests cover initial empty state and navigation at 320, 375, 430, 768, 1024, 1280, and 1440 pixels. All 19 current browser tests passed in local Chromium, including populated workflows, axe scans, nested dialogs, file cleanup, two-tab saves and offline reload. This is not a screen-reader or real-device certification.

## Architecture and sources of truth

- **Local records:** serialized AsyncStorage snapshots; write success precedes UI success. Failed writes preserve the prior snapshot. Guest and signed-in accounts have separate keys. Records are not encrypted at rest by this application.
- **Cloud records:** Supabase `purchases.record_data`, saved atomically through an RLS-governed RPC. Legacy relational rows remain readable; they are not a maintained reporting projection after a JSON record edit.
- **Sync:** durable save/delete outboxes; initial, mutation, explicit retry, and browser reconnect attempts. Paginated reads and account-bound authentication per sync attempt. Last successful server write wins for edits; **permanent server deletion wins over stale offline edits**. Native connectivity and simultaneous multi-device edits still require integration testing.
- **Deletions:** new tombstones prevent deleted IDs being resurrected. Restore uses new IDs. Tombstones are retained until account deletion. Pre-migration remote deletions cannot be reconstructed automatically.
- **Documents:** original attachments are copied into IndexedDB on web or app-owned native files, up to 20 MB. Supported attachment formats: PDF, JPEG, PNG, GIF, WebP. No cloud binary backup. Cloud synchronization and JSON exports include metadata and inline claim text, not attachment bytes. Keep originals. Durable cleanup queues and a confirmation-time orphan rescan remove managed copies only; corrupt reference caches stop cleanup.
- **Authentication:** Supabase Auth; native tokens use Expo SecureStore, browser sessions use browser storage. Session restoration can expose the matching local cache offline; RLS authenticates cloud operations. Web password-recovery UI exists but requires real email/redirect tests. Native PKCE recovery callbacks are implemented but require redirect configuration and device/email verification.
- **AI:** optional HTTPS transport with user JWT, explicit user action, request bounds, timeout and manual retry. No provider secret in the app. A JWT-authenticated, quota-controlled Edge Function is included but not deployed or provider-tested. Leave the endpoint empty until live verification. No OCR or document extraction is implemented. Templates work without AI.
- **Deadlines:** date-only calendar validation and calendar-day arithmetic. User-entered dates are not verified retailer policies. Completion does not change legal coverage.
- **Notifications:** unavailable. Deadline Radar is a viewing surface, not a notification service.
- **Payments:** none.

## Environment

Only public, client-safe values belong in Expo variables:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Your HTTPS Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon/publishable client key; never service-role |
| `EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT` | Optional trusted HTTPS backend base URL; requires Supabase sign-in |

Expo embeds these at build time. Never set provider secrets, service-role keys or private signing credentials in client variables.

## Database deployment

On a fresh Supabase project apply these migrations in filename order:

1. `202609230001_initial_schema.sql`
2. `202609250001_atomic_purchase_records.sql`
3. `202609260001_deletion_integrity.sql`
4. `202609260002_service_controls.sql`

On an existing baseline project apply only unapplied migrations using Supabase migration history. Back up first. The third migration disables legacy household reads for purchase records (there is no consent/sharing UI), adds permanent owner-readable tombstones, guards resurrection, and tightens document re-parenting. **Deploy the migration before the new client.** Without it synchronization fails visibly and retains queued work.

The PostgreSQL test harness applies all migrations with minimal Auth/Storage schemas; it is not a substitute for the real Supabase test checklist in the launch audit.

## Backup / restore

Settings exports schema-version-1 JSON with `schemaVersion`, `appVersion`, `exportedAt`, `documentsIncluded`, and `purchases`. Nested purchase records contain deadlines and document metadata/claim text. Local URIs and all attachment bytes are omitted. Native export writes a temporary JSON file for platform sharing and removes the temporary copy afterward; keep a separately saved copy.

Restore accepts up to 5 MB / 5,000 records, validates IDs, dates, money, document and deadline records, then requires confirmation. It appends new IDs to the currently active account, does not overwrite existing records, and strips all imported URIs. Repeated restores create copies. An export from another account does not carry account ownership; confirmation explicitly assigns restored copies to the current account.

## Privacy and release operations

See [privacy disclosure draft](docs/PRIVACY.md), [launch audit / deployment gates](docs/LAUNCH_AUDIT.md), and [dependency review](docs/DEPENDENCY_SECURITY.md). Do not publish the privacy draft without the operator identity, contact channel, retention decisions and legal review. Never attach private exports or receipts to public GitHub issues.

## Service deployment and release gates

See [operator runbook](OPERATOR_RUNBOOK.md) for exact commands, required configuration, and live acceptance checks. `npm run check:release` intentionally fails until real configuration and approvals exist. Public version remains 1.0.0. Account deletion and AI must remain disabled pending those checks.
