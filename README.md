# ProofPilot

**ProofPilot protects everything you buy.** An Expo / React Native + TypeScript app that keeps receipts, return windows, warranties, and purchase deadlines in one calm, organized place — with an AI assistant and claim drafts that only ever use your verified purchase facts.

## Features

- **Dashboard** — protection overview, items that need attention, upcoming deadlines, recent purchases, Vault snapshot, and the ProofPilot assistant entry point.
- **Purchases** — searchable, sortable collection of everything you own.
- **Add / edit purchase flow** — receipt scan or upload, manual entry with quick date chips, price sanitizing, merchant/category suggestions, review step, and a success summary with protection status.
- **Purchase record** — return window, warranty, product facts, documents, notes, Ask ProofPilot, and the Claim generator.
- **Deadline Radar** — overdue / today / this week / this month / later, with search, filters, and sorting.
- **Protection Vault** — receipts, warranty documents, product documents, and claim drafts, organized and openable.
- **Ask ProofPilot & Claim generator** — scoped to your saved facts; clearly separate what is KNOWN from what is MISSING; drafts are editable, never sent automatically. If the secure AI service is not configured, both explain that honestly instead of guessing.
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
