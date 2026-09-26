# ProofPilot

**ProofPilot protects everything you buy.** An Expo / React Native + TypeScript app that keeps receipts, return windows, warranties, and purchase deadlines in one calm, organized place — with an AI assistant and claim drafts scoped to your saved purchase records (AI output must still be checked).

## Features

- **Dashboard** — protection overview, items that need attention, upcoming deadlines, recent purchases, Vault snapshot, and the ProofPilot assistant entry point.
- **Purchases** — searchable, sortable collection of everything you own.
- **Add / edit purchase flow** — receipt scan or upload, manual entry with quick date chips, strict price validation, merchant/category suggestions, review step, and a success summary with protection status.
- **Purchase record** — return window, warranty, product facts, documents, notes, Ask ProofPilot, and the Claim generator.
- **Deadline Radar** — overdue / today / this week / this month / later, with search, filters, and sorting.
- **Protection Vault** — receipts, warranty documents, product documents, and claim drafts, organized and openable.
- **Ask ProofPilot & Claim generator** — scoped to your saved facts; clearly separate what is KNOWN from what is MISSING; drafts are editable, never sent automatically. If the secure AI service is not configured, the assistant explains that honestly; deterministic claim templates remain available.
- **Local-first data** — purchases and settings persist on the device (AsyncStorage). Sample data seeds the first launch and can be cleared or restored in Settings.
- **Supabase foundation** — auth screen, session handling, and a full RLS schema in `supabase/migrations` for cloud sync when configured.

## Getting started

```bash
npm install
npm start          # web (expo start --web)
npm run android    # android
npm run ios        # ios
```

### Optional configuration

Copy `.env.example` to `.env`:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Enables sign-in / cloud foundation |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Enables sign-in / cloud foundation |
| `EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT` | Your trusted AI backend (`POST /purchase-question`, `POST /claim-draft`). Provider keys belong on that server, never in the app. |

Without these, ProofPilot runs fully in local-first mode and says so wherever a cloud or AI feature would appear.

## Honesty rules this codebase follows

- No fabricated statistics, dates, policies, or AI answers.
- Features that are not wired up (notifications, receipt OCR, cloud document storage) say so in the UI.
- Claims are drafts you review, edit, and send yourself. ProofPilot never sends anything.
- No payments or billing of any kind in this build.

## Type check & build

```bash
npx tsc --noEmit
npx expo export --platform web
```

## September 2026 product upgrade

The Expo / React Native architecture is unchanged. This upgrade adds:

- A responsive forest-green dashboard hero, four live record metrics, readable protection overview, richer purchase cards, and phone navigation through 759px.
- Protection filtering and next-deadline sorting alongside purchase search and categories.
- Active/completed Deadline Radar views with persisted completion/reopening. Completing a task never changes coverage or submits a claim.
- Proof-of-purchase summaries, strict monetary/calendar/chronology validation, and zero-price support.
- Vault type filters, searchable document records, confirmed deletion, and recoverable file errors. Native files use app-owned storage; web files use IndexedDB (20 MB per file). Clearing browser/app data still removes local files. Keep originals.
- Serialized, failure-aware local writes; account-isolated device caches; durable cloud save/delete queues with explicit retry and reconnect retry. Failed writes leave the previous saved state intact. Sample restoration adds missing examples without replacing your records.
- Settings success is reported only after storage succeeds. Storage errors remain visible.
- Saved-facts claim templates work without AI. Optional AI output is explicitly unverified, editable, and never submitted. Generated claims are excluded from document evidence in AI context.

### Cloud upgrade deployment (required for configured Supabase builds)

Apply **both** migrations in `supabase/migrations`, in filename order, including
`202609250001_atomic_purchase_records.sql`. The new migration adds `purchases.record_data`
and authenticated, RLS-governed `save_purchase_record` / `delete_purchase_record` RPCs.
Each save is one atomic transaction with an idempotent account-scoped ID; it no longer deletes
and reinserts child tables over multiple HTTP requests. Existing relational records remain
readable until edited. The application snapshot becomes authoritative for edited records;
legacy child tables are not maintained as a reporting projection.

Document metadata and generated claim text sync in that record; device file locations and
uploaded file bytes do not. A document on another device can therefore be metadata-only.
Cloud failures (including a missing migration) retain the local outbox and show a retry action.
Cloud fetches merge records without overwriting pending local edits or local file locations.
Conflicting edits across devices use last successful server write; this is not collaborative
merge. Remote-only deletion is not used to erase an existing device cache automatically.

Guest records remain under the legacy device key; signed-in accounts have separate keys.
There is no automatic import of guest data into an account, preventing accidental cross-account
uploads. Export guest records before configuring cloud if you need a separate backup. JSON
exports include record metadata and file references, **not** binary document backups.

## Pre-launch product polish — toward 1.0.0

The Expo / React Native architecture, Supabase foundation, and local-first behavior are
unchanged. This pre-launch work focuses on product depth, honesty, and regression safety
(treated internally as iterative polish toward the first public release):


- **Dashboard** — every metric now comes from stored records only: total purchases, protected,
  need attention, upcoming deadlines, expiring warranties (30 days), missing receipts, and
  completed deadlines, plus an urgency-ordered "What needs your attention" list
  (return deadlines → warranty expirations → missing proof → other dates).
- **Purchases** — pinning (pinned records float to the top everywhere), sorting by date, name,
  price, next deadline, and warranty end with direction control, receipt/pinned/category/
  protection filters with one-click reset, an improved no-results state, and incremental
  rendering ("Show more") so large collections stay fast.
- **Purchase record** — pin/unpin, copy-record-summary quick action, and a next-deadline badge
  next to the protection status.
- **Deadline Radar** — "Overdue / expired" wording for past dates and a two-step confirmation
  before marking a deadline completed (reopening stays one tap).
- **Vault / document viewer** — in-app image previews (IndexedDB blobs resolved to object URLs
  on web, file URIs on native), plus share/download actions. Failures keep the record and say
  what happened.
- **Claims** — a visible four-step workflow (verify facts → add issue → draft → review &
  export), template vs. AI labeling on every draft, and a "Start over" action.
- **Ask ProofPilot** — failed questions return to the composer with an explicit error and a
  "Retry last question" button; answers render as paragraphs; unavailable AI states are stated
  plainly and never filled with fabricated content.
- **Settings** — five-state sync indicator (Local / Syncing / Synced / Error / Offline),
  two-step sign-out confirmation, and a Support section linking to GitHub issues.
- **Auth** — provider errors map to plain-language messages without inventing causes.
- **Reliability** — store mutations (upsert/remove/replace/outbox) are pure, shared helpers
  with tests for duplicate saves, tombstone revival, per-account storage isolation, and
  bulk-replace semantics; the shell memoizes derived state.
- **Accessibility** — removed nested interactive controls in attention rows, added labels to
  new interactive surfaces, and kept touch targets ≥ 44px.
- **Version 1.0.0** is declared once in `src/design/tokens.ts` (`APP_VERSION`) and mirrored in
  `package.json` / `app.json` — the first public release will be 1.0.0. Internal polish does not bump the public major version.

No new Supabase migration is required for this polish: pinning and all record edits travel inside the
existing `record_data` JSONB column via `save_purchase_record`. Both migrations in
`supabase/migrations` must still be applied for cloud sync to work at all.

### Verification

```bash
npm test                 # unit + selector + store + screen render suites
npx tsc --noEmit
npx expo export --platform web
git diff --check
npm run preview          # production export on 0.0.0.0:8080
```

Tests cover calendar boundaries, completion, reopening, live protection, strict validation
(including zero-price and malformed prices), concurrent writes, quota failures, recovery,
durable outboxes, cloud merge preservation, per-account isolation, attention prioritization,
purchase sort/filter behavior, pin migration, settings validation, auth error mapping,
screen render states, and the AI trust boundary (malformed responses, template labeling,
no fabricated answers). Live Supabase integration requires a configured project and applied
migrations.

### Known limitations (honest list)

- Document **files** live only on the device that attached them (IndexedDB/app files);
  clearing site/app data removes them. Cloud sync carries document metadata and claim text,
  never file bytes.
- Notifications are not wired up; Deadline Radar is the reminder surface. The app says so.
- AI answers and drafts require a backend you operate (`EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT`);
  when absent, ProofPilot explains that and offers deterministic templates.
- Cross-device edits resolve by last successful server write — not collaborative merging.
- Modal focus is not keyboard-trapped on web; Escape and backdrop dismissal work.

## Versioning philosophy

ProofPilot has not yet had a public launch. The public product version is **1.0.0**.

- Before public launch, we make large internal improvements (design, UX, architecture, reliability, accessibility, performance, tests) and treat them as pre-launch polish — the code evolves, the customer still sees **1.0**.
- The first time someone downloads ProofPilot they will see **ProofPilot 1.0** — mature and polished because we did the work before launch, not because we rushed version numbers.
- After launch we use gradual semantic versioning: `1.0.0` first public release, `1.0.1`/`1.0.2` bug fixes, `1.1.0` meaningful feature, `1.2.0` next feature, `2.0.0` only for a genuinely major product transformation.
- Internal development milestones (commits, redesigns, refactor passes) are not exposed as public major versions.
