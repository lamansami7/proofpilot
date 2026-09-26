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

### Verification

```bash
npm test
npx tsc --noEmit
npx expo export --platform web
git diff --check
npm run preview  # production export on 0.0.0.0:8080
```

Tests cover calendar boundaries, completion, live protection, strict validation, concurrent
writes, quota failures, recovery, durable outboxes, cloud merge preservation, and template
honesty. Live Supabase integration requires a configured project and applied migrations.
