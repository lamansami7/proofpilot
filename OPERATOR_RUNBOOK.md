# ProofPilot 1.0.0 — operator runbook

No live services were deployed during this work. Do not use production/customer accounts for verification. Never send credentials in chat or commit populated environment files.

## 1. Local reproducible checks

Node 22+; Deno 2 for Edge checks; supported Chromium for Playwright.

```sh
npm ci
npm test -- --runInBand
npm run test:migrations
npm run test:tooling
npm run test:release-config
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm run test:edge
npm run check:edge
npm run build:web
npx playwright install chromium
npm run test:e2e
npm audit
git diff --check
```

`npm run preview` serves the export on 0.0.0.0:8080. Production hosting requires HTTPS, public shell assets/service-worker.js, SPA fallback to index.html, no caching of auth/API responses, and tested deep links. Service-worker cache contains static public assets only. Purge/version rollback and client update behavior need deployment testing.

## 2. Dedicated Supabase staging project

Required privately: Supabase CLI login/access, project reference, database password if requested by CLI. Back up an existing database, inspect migration history, then apply only unapplied migrations. Do not run SQL manually against customer records.

```sh
supabase login
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase migration list
supabase db push --dry-run
supabase db push
# Copy and privately populate a server-only file OUTSIDE the repository first:
supabase secrets set --env-file "$PROOFPILOT_SERVER_ENV_FILE"
supabase functions deploy delete-account
supabase functions deploy proofpilot-ai
```

All four migrations must be applied in filename order, ending with `202609260002_service_controls.sql`, BEFORE deploying this client. Hosted functions use their own Auth getUser checks; gateway legacy JWT verification is disabled in config for asymmetric key compatibility. Do not remove handler authentication. Supabase injects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY server-side; never embed either privileged key in Expo. Configure ALLOWED_ORIGINS as comma-separated exact owned HTTPS origins, not `*`.

Configure verified SMTP sender/domain, SPF/DKIM/DMARC, delivery/bounce monitoring and email templates in Supabase. Configure Site URL to the owned HTTPS web origin and exact redirect allowlist entries for that origin and `proofpilot://auth/callback`. PKCE recovery must be initiated and opened on the same installed app/device. Test expired/reused/wrong-device links, email confirmation, reset, sign-out, restart and session refresh. Never use wildcard production redirect URLs.

Create two distinct email-confirmed dedicated QA users. Set securely:

- EXPO_PUBLIC_SUPABASE_URL; EXPO_PUBLIC_SUPABASE_ANON_KEY (public client key only)
- PROOFPILOT_TEST_EMAIL_A; PROOFPILOT_TEST_PASSWORD_A
- PROOFPILOT_TEST_EMAIL_B; PROOFPILOT_TEST_PASSWORD_B
- PROOFPILOT_STAGING_PROJECT_REF (the exact 20-character reference of the dedicated staging project; URL must equal its canonical https://REF.supabase.co URL)
- PROOFPILOT_ALLOW_STAGING_TESTS=yes

```sh
npm run test:live
```

This creates/deletes uniquely identified QA purchases and retains their tombstones. It tests isolation, idempotency and stale resurrection denial, not full multi-device or email verification.

### Manual live acceptance (record evidence)

1. Two accounts cannot read/write each other's purchase/document/tombstone rows or Storage prefixes, including direct REST access.
2. Two physical devices: edit offline, delete elsewhere, reconnect in both orders; deleted IDs must never resurrect. Test simultaneous edits (last server write wins), account switching during slow sync, pagination and interrupted retries.
3. Deletion: recent-password enforcement, forged target denial, nested Storage objects, partial/failing Storage deletion, >1,000 objects/retry, cloud-write freeze, cascade removal. Auth must not disappear before Storage cleanup.
4. Interrupt the final deletion response and simulate failed local ledger/storage writes. Unknown confirmation remains blocked, not falsely successful. Verify private-support identity checking and device cleanup. No customer launch until recovery is approved. Clear every participating device's offline cache after verified deletion; remote erasure of disconnected devices is not implemented.
5. Real SMTP inbox/spam, redirect and native secure storage persistence across restart/expiry. Browser back, screen rotation, install/update and network transition tests.

## 3. Optional AI

Server secret file keys: ALLOWED_ORIGINS, AI_ENABLED (default false), AI_MODEL (approved actual model ID), OPENAI_API_KEY. Configure provider account/billing budget/alerts, retention policy and regional/privacy approval. Client endpoint, only after verification: `https://YOUR_PROJECT.supabase.co/functions/v1/proofpilot-ai` in EXPO_PUBLIC_PROOFPILOT_AI_ENDPOINT. Do not put provider keys in client variables.

Verify missing/expired JWT, denied origins, oversize input, provider timeout/cancellation/429/500, malformed output, disabled mode and quota enforcement (3/minute, 20/day/account, 200/day deployment). Confirm provider logs do not expose unnecessary context. AI output remains unverified guidance; no OCR, legal guarantee or automatic merchant submission.

## 4. Public policy and native distribution

Supply operator legal identity, private support address, hosting region, retention/backup erasure schedule, subprocessors and reviewed legal policy. Publish an independent deletion-request URL and real support workflow. Configure EXPO_PUBLIC_PRIVACY_POLICY_URL (HTTPS), EXPO_PUBLIC_SUPPORT_EMAIL and, ONLY after deletion verification, EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true. Public Expo variables are embedded at build time; rebuild after changes.

Required: actual Expo/EAS project owner and login, unique confirmed package/bundle identifiers, Android signing keystore/Play Console access, Apple team/certificates/profiles/App Store Connect access for iOS. These are configured privately in provider tooling, never in chat.

```sh
eas login
eas init
# Review generated real projectId in app.json; configure public build vars in EAS environments.
eas build --platform android --profile preview
# Install that signed APK on real supported devices and complete acceptance.
eas build --platform android --profile production
eas build --platform ios --profile production
```

Review current Play target API and Apple SDK/Xcode rules against Expo SDK 52 before spending a release build; local prebuild is not store compatibility evidence. Upgrade the SDK if required, with another full regression. Audit generated Android permissions (including template storage/overlay/vibration permissions); remove unnecessary release permissions only after device compatibility checks. Original app icon/adaptive icon/splash/favicon assets are included, not approved store listings. Supply screenshots from the actual release, Android feature graphic, description, support/privacy/deletion URLs, age rating, Data Safety and App Privacy declarations. Do not claim notification, OCR or attachment cloud backup features.

After recording actual approvals in release CI, not merely to bypass the check:

```sh
# Set securely: PROOFPILOT_LIVE_VERIFICATION_APPROVED=yes
# Set securely: PROOFPILOT_DEVICE_VERIFICATION_APPROVED=yes
# Set securely: PROOFPILOT_LEGAL_VERIFICATION_APPROVED=yes
npm run check:release
```

The gate validates public URL/key types, native/EAS identifiers and approval presence, not actual project ownership, key validity, deployment or truth of approvals. It is not release authorization. Keep version 1.0.0; increment native build identifiers for subsequent uploads as required. No automatic submit or merge is authorized.


## Continuation acceptance checklist

- **VERIFIED:** local suites and native generation recorded in LAUNCH_AUDIT.md. No dependency upgrade or architecture rewrite in this continuation.
- **REQUIRES CONFIGURATION:** explicitly identify staging reference before running test:live; configure public keys only. No script will discover or assume your production project. Review CLI link target before each migration/deployment command above.
- **REQUIRES EXTERNAL SERVICE:** inject a lost final deletion response; verify server-side Storage/Auth/cascades directly using privileged operator tooling, not a failed sign-in as proof. Inject failed local credential deletion and file cleanup: a confirmed ledger must persist, retry must finish, and other accounts must remain intact. Test unconfirmed ledgers on restart: no cache hydration/sync or success UI. This remains a launch blocker until verified recovery/support is approved.
- **REQUIRES REAL DEVICE:** Android and iOS generation passed locally; install signed builds to verify first-invalid-field focus/keyboard scrolling, native callback cancellation, secure-storage deletion errors, camera/files/sharing and accessibility. Android needs keystore/EAS and an actual Android device. iOS additionally needs Apple signing/provisioning and an actual iPhone/iPad. No signed binary/device result exists yet.
- **REQUIRES HUMAN/LEGAL DECISION:** approve and exercise the private deletion-support procedure, policy/contact, retention and store disclosures; record LEGAL approval only after completing review.

AI responses now label supplied context as user-provided; the model cannot supply the returned fact list. Generated answer/draft prose still requires human verification and must not be presented as verified extraction or guaranteed factual output. Provider response reading is capped at 64 KiB and five seconds, within the overall upstream timeout. Leave AI disabled until live quota, cancellation and provider-failure tests pass.
