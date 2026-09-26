# ProofPilot privacy disclosure — operator review required

Version 1.0.0 · reviewed September 26, 2026

**This is a technical disclosure draft, not a finalized public legal policy.** The operator must supply its legal identity, private privacy-contact address, applicable jurisdictions, hosting regions, retention schedule, and rights-request process before publication. Those facts cannot be inferred from source code.

## What the application stores

Purchase names, merchants, prices (currently USD), dates, categories, serial/model numbers, notes, document metadata, attachments, custom deadlines, completion state and claim drafts are entered by users. Local settings and purchase records are stored on the device/browser. They are not encrypted by ProofPilot. A shared browser profile/device can expose locally stored records. Native authentication tokens use the operating system's secure storage; web sessions use browser storage.

With account functionality enabled, Supabase processes email addresses, authentication credentials/session information and synchronized purchase records. Passwords are handled by Supabase Auth, not a custom ProofPilot password database. Infrastructure providers may process IP addresses, request metadata and operational logs; actual retention and region depend on the deployed project's configuration.

Binary receipt and warranty attachments remain in browser IndexedDB or native app-owned files. Cloud records and exports can contain filenames and inline claim-draft text. Clearing site/app data or uninstalling may remove local data; exports do not include attachment binaries. Keep independent originals.

## Optional AI

When configured, asking a question or requesting an AI claim draft sends the question/issue and selected purchase context to the operator's HTTPS backend, authenticated by a Supabase user token. Default context includes product, merchant, price, dates, provider, model and non-claim document names; serial numbers, private notes, raw file contents and existing claim drafts are excluded. Users may still type sensitive information into questions. No requests are sent just by viewing a purchase.

The operator must identify the actual AI provider, region, retention and training-use terms before enabling this feature. No provider is connected or verified in this checkout. AI guidance can be wrong and is not legal advice or a retailer's policy decision. Nothing is submitted to a merchant automatically.

## Other services

No advertising, payment, product analytics or crash-reporting SDK is implemented in the application flows reviewed. Hosting, Supabase and build tooling can have separate operational logging. GitHub support issues are public and governed by GitHub's terms; never post exports, receipts, authentication details or private identifiers there.

## Retention and deletion limitations

Local data persists until removal/clearing. Signing out is not data deletion: account-scoped caches and attachments can remain on the device. Deleting a purchase queues cloud deletion while signed in. Permanent deletion markers are retained to prevent stale devices restoring deleted records; they cascade when the authentication account is deleted.

Removed purchases persist managed-file cleanup intent; confirmed orphan cleanup rechecks references and excludes files younger than 24 hours. Failed cleanup can leave files and is retryable. Corrupt caches stop deletion rather than risk originals. Delete-all purchases is not secure device erasure or account deletion. Self-service account deletion code is included but disabled by default and not live-verified. It removes owned Storage objects before the Auth account and cascaded records. A lost response or failed confirmation-ledger write can require private support and explicit device-data clearing; the client never assumes deletion succeeded. Other devices can retain offline caches. The operator must verify these paths, provide an independent web deletion-request route for store requirements, and publish a private support process before consumer launch. Provider backups may follow separate retention rules, which must be disclosed.

## User controls

Users can edit records, confirm destructive actions, export metadata/claim text, restore validated backups, and decline optional AI actions. Files require independent backup. Statutory access, correction, portability and deletion requests require a published operator contact and verified process. No compliance certification or universal privacy/security guarantee is claimed here.
