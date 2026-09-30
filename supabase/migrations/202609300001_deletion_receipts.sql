-- Durable receipt for a COMPLETED account deletion (lost-final-response recovery).
--
-- The client generates a 256-bit random receipt, keeps it in its local unconfirmed
-- ledger, and sends it with the delete-account request. The service stores only the
-- SHA-256 hash here: a pending row BEFORE any destructive work, and completed_at
-- only AFTER Auth deletion succeeds. A client whose final response was lost can
-- then prove completion by presenting the receipt — never by a failed sign-in.
-- Unknown receipts return nothing, so this is not an account-existence oracle.
--
-- No foreign key to auth.users: the receipt must outlive the deleted account.
-- Contains no email, token, file name or other personal data.
create table public.account_deletion_receipts (
  receipt_hash text primary key check (receipt_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.account_deletion_receipts enable row level security;
-- Service-role only. No client may read, write or even know whether a receipt exists.
revoke all on public.account_deletion_receipts from anon, authenticated;
grant all on public.account_deletion_receipts to service_role;
-- Support lookups: "show every receipt row for this user id".
create index account_deletion_receipts_user_idx on public.account_deletion_receipts(user_id);
