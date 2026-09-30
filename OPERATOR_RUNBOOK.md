# ProofPilot 1.0.0 — operator runbook

No live services were deployed during this work. Do not use production/customer accounts for verification. Never send credentials in chat or commit populated environment files.

## 1. Local reproducible checks

Node 22+; Deno 2 for Edge checks; supported Chromium for Playwright. The release gate and live-check scripts safely load an optional ignored `.env.local` using Node's dotenv parser; process/CI variables take precedence. Use dedicated staging credentials only, and never commit or share the file.

```sh
npm ci
npm test -- --runInBand
npm run test:migrations
npm run test:tooling
npm run test:release-config
npm run test:client-secrets
npm run test:staging-config
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm run test:edge
npm run check:edge
npm run build:web
npm run check:secrets
npx playwright install chromium
npm run test:e2e
npm audit
git diff --check
```

If the official Deno installer host is blocked in your environment, `npx -y deno <subcommand>`
works: the Deno binary is fetched from the npm registry instead (`npx -y deno test
supabase/functions/_shared/handlers_test.ts` is equivalent to `npm run test:edge`).

`npm run check:secrets` is the only automatic check that a shipped client artifact contains no
privileged key or provider secret. Run it against the exact build you intend to publish, after
configuring the public `EXPO_PUBLIC_*` values, and confirm the report names no rule.

`npm run preview` serves the export on 0.0.0.0:8080. Production hosting requires HTTPS, public shell assets/service-worker.js, SPA fallback to index.html, no caching of auth/API responses, and tested deep links. Service-worker cache contains static public assets only. Purge/version rollback and client update behavior need deployment testing.

## 2. Dedicated Supabase staging project

Required privately: Supabase CLI login/access, project reference, database password if requested by CLI. Back up an existing database, inspect migration history, then apply only unapplied migrations. Do not run SQL manually against customer records.

```sh
supabase login
supabase link --project-ref "$PROOFPILOT_STAGING_PROJECT_REF"
supabase migration list
supabase db push --dry-run
supabase db push
# Copy and privately populate a server-only file OUTSIDE the repository first:
supabase secrets set --env-file "$PROOFPILOT_SERVER_ENV_FILE"
supabase functions deploy delete-account
supabase functions deploy proofpilot-ai
```

All **six** migrations must be applied in filename order, ending with `202609300001_deletion_receipts.sql`, BEFORE deploying this client. Apply the migration BEFORE deploying the `delete-account` function update: without the receipt table the updated function fails closed (deletion refuses to start) rather than running unreceipted. Hosted functions use their own Auth getUser checks; gateway legacy JWT verification is disabled in config for asymmetric key compatibility. Do not remove handler authentication. Supabase injects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY server-side; never embed either privileged key in Expo. Configure ALLOWED_ORIGINS as comma-separated exact owned HTTPS origins, not `*`.

Configure verified SMTP sender/domain, SPF/DKIM/DMARC, delivery/bounce monitoring and email templates in Supabase. Configure Site URL to the owned HTTPS web origin and exact redirect allowlist entries for that origin and `proofpilot://auth/callback`. PKCE recovery must be initiated and opened on the same installed app/device. Test expired/reused/wrong-device links, email confirmation, reset, sign-out, restart and session refresh. Never use wildcard production redirect URLs.

`EXPO_PUBLIC_AUTH_REDIRECT_URL` must name the same HTTPS origin you add to the Supabase Auth redirect allowlist (for production, `https://get-proofpilot.lovable.app`). `npm run check:release` rejects it unless it is public HTTPS with no credentials, query string or fragment, and never accepts localhost. If the two lists disagree, confirmation and password-recovery links return the user to a page Supabase will not accept. The "Resend confirmation email" action on the sign-up screen re-sends a signup confirmation and always answers with the same neutral wording, so it never reveals whether an address has an account.

Create two distinct email-confirmed dedicated QA users. Set these only for the dedicated staging project, either in your secure shell/CI environment or in the ignored local `.env.local` file (`npm run test:live` loads that file with Node's dotenv parser). Never use production/customer accounts or commit the file:

- EXPO_PUBLIC_SUPABASE_URL; EXPO_PUBLIC_SUPABASE_ANON_KEY (public client key only)
- PROOFPILOT_TEST_EMAIL_A; PROOFPILOT_TEST_PASSWORD_A
- PROOFPILOT_TEST_EMAIL_B; PROOFPILOT_TEST_PASSWORD_B
- PROOFPILOT_STAGING_PROJECT_REF (the exact 20-character reference of the dedicated staging project; URL must equal its canonical https://REF.supabase.co URL)
- PROOFPILOT_ALLOW_STAGING_TESTS=yes
- For the destructive deletion matrix only (`npm run test:live:deletion`): PROOFPILOT_DELETE_TEST_EMAIL and PROOFPILOT_DELETE_TEST_PASSWORD (the THIRD disposable account — never A, never B, never a personal account) plus PROOFPILOT_SERVICE_ROLE_KEY (the staging project's server key, used locally for privileged post-deletion evidence only; never an Expo variable, never printed, never committed)

```sh
npm run check:staging        # names any missing/unsafe variable; prints no values
npm run test:live            # non-destructive A/B isolation subset
npm run test:live:storage    # private-bucket RLS matrix with normal user sessions
npm run test:live:deletion   # DESTRUCTIVE 19-item deletion matrix + lost-response receipt check
```

`npm run test:live` creates/deletes uniquely identified QA purchases and retains their tombstones. It tests isolation, idempotency and stale resurrection denial, not full multi-device or email verification. `npm run test:live:storage` creates and removes only temporary probe objects owned by QA A; it never deletes accounts and uses no service-role access as RLS evidence. `npm run test:live:deletion` **destroys and recreates only the disposable account**; its code-level safety rails refuse to run if the disposable email matches QA A or QA B, and a final stage proves A and B still sign in afterwards. If any script fails, the report names the exact stage that failed and never echoes a token, email or record value — paste that line into a private note, not into a public issue.

### Manual live acceptance (record evidence)

1. Two accounts cannot read/write each other's purchase/document/tombstone rows or Storage prefixes, including direct REST access.
2. Two physical devices: edit offline, delete elsewhere, reconnect in both orders; deleted IDs must never resurrect. Test simultaneous edits (last server write wins), account switching during slow sync, pagination and interrupted retries.
3. Deletion: run `npm run check:staging` then `npm run test:live:deletion`. The script automates recent-password enforcement, missing/stale password proof, forged target denial, wrong-account protection, deletion request creation, cloud-write freeze, partial Storage cleanup failure (deep-hierarchy injection), Storage retry, the >1,000-object cap, DB cascade removal, Auth-last ordering (auth must not disappear before Storage cleanup), deleted DB/Storage records staying deleted, no resurrection with the old session or refresh token, repeated-deletion refusal, idempotent receipt confirmation, lost-response recovery, and proof that QA A and B remain intact. It refuses to run without the third disposable account and a service-role evidence key, and it never targets A or B.
4. Interrupt the final deletion response and simulate failed local ledger/storage writes. The automated lost-response case is part of `npm run test:live:deletion` (receipt status confirms a discarded response; pending/unknown states stay blocked). For the manual client check: unconfirmed ledgers must keep blocking hydration/sync with no success UI; verify private-support identity checking and device cleanup. No customer launch until recovery is approved. Clear every participating device's offline cache after verified deletion; remote erasure of disconnected devices is not implemented.
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
- **REQUIRES EXTERNAL SERVICE:** run `npm run test:live:deletion` to inject a lost final deletion response against the deployed receipt protocol and verify server-side Storage/Auth/cascades with privileged operator tooling, never a failed sign-in as proof. Inject failed local credential deletion and file cleanup: a confirmed ledger must persist, retry must finish, and other accounts must remain intact. Test unconfirmed ledgers on restart: no cache hydration/sync or success UI. This remains a launch blocker until that live matrix and the private-support procedure are verified and approved.
- **REQUIRES REAL DEVICE:** Android and iOS generation passed locally; install signed builds to verify first-invalid-field focus/keyboard scrolling, native callback cancellation, secure-storage deletion errors, camera/files/sharing and accessibility. Android needs keystore/EAS and an actual Android device. iOS additionally needs Apple signing/provisioning and an actual iPhone/iPad. No signed binary/device result exists yet.
- **REQUIRES HUMAN/LEGAL DECISION:** approve and exercise the private deletion-support procedure, policy/contact, retention and store disclosures; record LEGAL approval only after completing review.

AI responses now label supplied context as user-provided; the model cannot supply the returned fact list. Generated answer/draft prose still requires human verification and must not be presented as verified extraction or guaranteed factual output. Provider response reading is capped at 64 KiB and five seconds, within the overall upstream timeout. Leave AI disabled until live quota, cancellation and provider-failure tests pass.


## Supabase staging configuration boundary (inspection at 82dfa80)

**REQUIRES CONFIGURATION:** no staging reference, URL, public key, opt-in or either QA credential pair is available in the inspected environment or conventional local env files. No CLI project link exists; the Supabase CLI is not on PATH. No remote request or deployment was made. `supabase/config.toml` describes local development; its project_id and localhost Auth URLs do not identify or configure a hosted staging project.

### Operator setup — before any deployment

1. Create a separate, empty Supabase project for ProofPilot staging. Do not reuse production. Record its actual project reference and region. Confirm explicitly that this is the disposable QA project.
2. Configure public `PROOFPILOT_STAGING_PROJECT_REF`, `EXPO_PUBLIC_SUPABASE_URL=https://<actual-reference>.supabase.co`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable or legacy anon key from that SAME project). Reference and URL must match exactly. The reference format is checked by the current script. A format check is not proof of ownership.
3. Install a supported Supabase CLI using Supabase's installation instructions. Authenticate with `supabase login` privately, or inject SUPABASE_ACCESS_TOKEN via a secure process environment. Supply the project's database password through the CLI's private prompt when required. Never put those secrets in Expo variables, source, logs or chat. Verify the CLI link against the intended staging project before `migration list`, dry-run, push or function deployment. Do not run the earlier deployment commands until this check is complete.
4. Choose the actual HTTPS staging app origin. In hosted Auth URL Configuration set Site URL to that origin and allow the exact origin plus `proofpilot://auth/callback` for installed native QA builds. Do not use wildcard redirects. Enable email/password authentication, email confirmation and minimum password length of at least eight. Configure your SMTP host/port, private username/password, verified sender and DNS records. Disable mail-provider link tracking if it rewrites Auth links. QA must be able to open real confirmation/recovery mail in the same browser/device that initiated PKCE.
5. Create two separate QA-only users A/B with controlled inboxes; confirm them. Inject the four PROOFPILOT_TEST_EMAIL_A / PASSWORD_A / EMAIL_B / PASSWORD_B variables privately into the test process. Set PROOFPILOT_ALLOW_STAGING_TESTS=yes only after confirming the project. Use additional disposable users for account-deletion trials so A/B remain available for isolation tests; do not use your personal account. No extra deletion-user variable names are implemented yet.
6. Deploy all six migrations in order using migration history, not dashboard SQL edits. The migrations create the **private** purchase-documents bucket: 20 MiB limit, PDF/JPEG/PNG only; object paths are `<authenticated-user-id>/<QA-file-name>`. Do not add public bucket access or permissive RLS policies. Existing app attachments remain device-local; testing this bucket directly does not establish cloud attachment backup. Upload/update restrictions must be tested with ordinary user sessions, not service-role access (`npm run test:live:storage` does exactly this).
7. In staging Edge Function Secrets set ALLOWED_ORIGINS to the exact HTTPS staging app origin (comma-separated if multiple), and AI_ENABLED=false. Leave AI_MODEL/OPENAI_API_KEY unset and the public AI endpoint blank until a provider is deliberately configured. Hosted Supabase supplies SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY inside the functions; never copy the privileged key into the app. Deploy delete-account and proofpilot-ai to the explicitly linked staging project. Keep the repository's handler JWT verification: verify_jwt=false disables the legacy gateway check, not application authentication.
8. Keep EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=false for ordinary builds. Test the deletion endpoint directly with a disposable, recently password-authenticated QA account first; deployment alone is not sufficient. Enable the UI in an isolated staging QA build only after authenticated end-to-end deletion and failure/recovery behavior is evidenced; production remains disabled until acceptance. Do not set release approval variables merely to bypass the gate.

The existing `npm run test:live` reads **process environment variables** and also loads an optional ignored `.env.local` with Node's dotenv parser (process variables take precedence). Inject them with private tooling or the ignored file. No real values are required in tracked files. Non-secret project reference/URL/public key may be shared if needed, but do not send QA passwords, access tokens, database/SMTP passwords, service-role keys or provider secrets in chat.

### Live validation scope after setup

Three scripts cover live acceptance, each refusing to run without its exact configuration:

- `npm run test:live` — A/B sign-in, purchase creation/retrieval, cross-user read/write denial,
  idempotency and tombstone stale-save rejection.
- `npm run test:live:storage` — the private purchase-documents bucket with normal authenticated
  sessions only: owner upload/download/signed-URL positives, cross-user read/modify/delete/upsert
  denial, anonymous denial, nested foreign-prefix denial, user-scoped path enforcement, type and
  size rejections, and deletion persistence.
- `npm run test:live:deletion` — the destructive 19-item deletion matrix on the third disposable
  account, including privileged post-deletion evidence and the lost-response receipt check.

SMTP/recovery delivery, reconnection and actual multi-device behavior still need separately
recorded manual tests. No live result may be inferred from the local suites.

### Lost-response recovery — receipt protocol (implemented 2026-09-30)

The client now generates a 256-bit random receipt before every deletion request, stores it in its
local unconfirmed ledger, and sends it with the request. `delete-account` records only the
SHA-256 hash in `public.account_deletion_receipts` (service-role only): a **pending** row before
any destructive work and **completed_at** only after Auth deletion succeeds. If the final response
is lost, the app asks the same endpoint `{receipt}` (no session — the account may be gone) and
confirms deletion only on an exact `state: "completed"` answer bound to the same user id. A failed
sign-in is never evidence; pending, unknown or unreachable answers keep the app blocked with no
success UI and no data hydration.

Operator verification and support procedure:

1. Deploy migration `202609300001_deletion_receipts.sql` FIRST, then the `delete-account`
   function, then verify with `npm run test:live:deletion` (the script includes the discarded-
   response scenario and must show `state: "completed"` from the receipt alone).
2. If a user reports an stuck blocked app after starting deletion, verify server state with
   privileged operator tooling **in this order**: auth user existence, `storage.objects` under the
   user's prefix, `purchases`/`documents` rows, then `account_deletion_receipts` (look up by
   `user_id`; the stored value is only a hash — never ask the user to reveal anything beyond their
   own account identity).
3. Only after privileged evidence shows the account is fully deleted, instruct the user to clear
   local app/site data on that device (warning: it also erases other accounts' local originals on
   the same device). If the account still exists, have the user retry the in-app deletion flow
   with their password.
4. Never edit the local ledger by hand, never treat a failed sign-in as proof of deletion, and
   never report success without the receipt or privileged evidence. Keep this procedure exercised
   and approved before enabling `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED`.

With AI disabled, a 503 ai_unavailable only verifies disabled behavior: it does not prove deployed authentication/quota paths ran. Provider-enabled tests require server-only credentials/budget approval and separately recorded authentication, limits, malformed/oversized output, failures and timeouts. Fault injection results must be labeled as such, not as organic provider behavior.

Classification: **VERIFIED LIVE:** none. **VERIFIED LOCALLY:** source/configuration inspection and separately recorded local suites. **REQUIRES CONFIGURATION:** project, public settings, CLI access, QA users and staging origin. **REQUIRES EXTERNAL SERVICE:** SMTP/Auth/Storage/Edge/provider tests. **REQUIRES REAL DEVICE:** installed-app recovery and two-device lifecycle/conflicts. **REQUIRES HUMAN/LEGAL DECISION:** region/retention, destructive QA approval, private deletion support and provider data handling.

## Hosted inspection and handoff (2026-09-29)

Read-only, credential-free observations from the release-readiness pass recorded in
[docs/reviews/RELEASE_READINESS_2026-09-29.md](docs/reviews/RELEASE_READINESS_2026-09-29.md).

- `delete-account` and `proofpilot-ai` on project `kqepazkcunxfitjexjqc` both answer an unauthenticated
  `GET` with this repository's `{"error":"method_not_allowed"}` contract, so both routes respond.
  This does **not** establish control-plane ACTIVE status, migration parity, secrets, authenticated
  behavior or the Auth allowlist; use the authenticated CLI to verify status.
- The project gateway is up and rejects keyless requests; the public policy URL serves a policy page.
- **Unresolved claim mismatch:** the public web pages advertise reminders ("30 / 7 / 1 day reminders"),
  an AI assistant and household sharing. `README.md` records notifications as unavailable and
  migration `202609260001` disables household reads because no sharing/consent UI exists. Correct the
  public claims or implement the features before launch; do not treat the pages as product evidence.
- **Unresolved web-auth origin:** `https://get-proofpilot.lovable.app/auth` states web sign-in is not
  connected yet. Until the web client (with SPA fallback) is served on the origin you allow-list,
  confirmation and recovery links cannot complete a PKCE exchange there. Point
  `EXPO_PUBLIC_AUTH_REDIRECT_URL` and the Supabase redirect allowlist at the origin that actually
  serves the client, and add `proofpilot://auth/callback` for installed native builds.

Closed in that pass: the claim-type toggle now sets `aria-pressed`, so the seven browser cases that
assert toggle state pass; `npm run check:secrets` and `npm run test:client-secrets` now guard client
artifacts; five additional deletion-safeguard handler tests assert that unauthenticated, stale-proof,
wrong-origin, non-JSON and target-injecting requests perform zero cloud work.

Cautions for the operator's own environment:

- Do not run `supabase config push` against the hosted project: `supabase/config.toml` describes local
  development (`site_url = "http://localhost:8080"`) and would overwrite the hosted Site URL. Configure
  hosted Auth URLs in the dashboard, or in a project-specific config that names the production origin.
- Supabase CLI installs and runs from npm (`npx supabase`), but every hosted command needs
  `supabase login` or `SUPABASE_ACCESS_TOKEN`, and `supabase link --project-ref <ref>` writes
  `supabase/.temp/`, which must stay out of git (already ignored).
- `npm run test:live` refuses to run without an explicit staging reference, a matching public key,
  `PROOFPILOT_ALLOW_STAGING_TESTS=yes` and both QA credential pairs. It is not a production test.
