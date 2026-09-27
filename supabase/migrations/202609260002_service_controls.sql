-- Server-owned lifecycle and AI quotas. No prompts, files, emails or tokens stored here.
create table public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;
grant all on public.account_deletion_requests to service_role;

create function public.account_accepts_writes(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id=owner)
    and not exists(select 1 from public.account_deletion_requests where user_id=owner)
$$;
revoke all on function public.account_accepts_writes(uuid) from public;
grant execute on function public.account_accepts_writes(uuid) to authenticated, service_role;
create function public.guard_closing_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.account_accepts_writes(NEW.user_id) then
    raise exception 'Account deletion is in progress; new writes are disabled.' using errcode='23514';
  end if;
  return NEW;
end $$;
revoke all on function public.guard_closing_account() from public;
create trigger closing_account_guard before insert or update on public.purchases
for each row execute function public.guard_closing_account();
drop policy "private document files upload" on storage.objects;
create policy "private document files upload" on storage.objects for insert to authenticated
with check(bucket_id='purchase-documents' and (storage.foldername(name))[1]=auth.uid()::text and public.account_accepts_writes(auth.uid()));

create table public.ai_daily_usage (
  user_id uuid references auth.users(id) on delete cascade,
  usage_day date not null,
  requests integer not null check(requests >= 0),
  primary key(user_id,usage_day)
);
create table public.ai_minute_usage (
  user_id uuid references auth.users(id) on delete cascade,
  usage_minute timestamptz not null,
  requests integer not null check(requests >= 0),
  primary key(user_id,usage_minute)
);
create table public.ai_global_usage (usage_day date primary key, requests integer not null check(requests>=0));
alter table public.ai_daily_usage enable row level security;
alter table public.ai_minute_usage enable row level security;
alter table public.ai_global_usage enable row level security;
revoke all on public.ai_daily_usage, public.ai_minute_usage, public.ai_global_usage from anon,authenticated;
grant all on public.ai_daily_usage, public.ai_minute_usage, public.ai_global_usage to service_role;

-- Hard caps: 3/minute and 20/day per account; 200/day for the entire deployment.
-- Reservations are not refunded on provider failure, preventing retry cost amplification.
create function public.reserve_ai_request(actor uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'UTC')::date;
  minute timestamptz := date_trunc('minute',now());
begin
  perform pg_advisory_xact_lock(726182940);
  if not public.account_accepts_writes(actor) then return false; end if;
  if coalesce((select requests from public.ai_global_usage where usage_day=today),0)>=200
    or coalesce((select requests from public.ai_daily_usage where user_id=actor and usage_day=today),0)>=20
    or coalesce((select requests from public.ai_minute_usage where user_id=actor and usage_minute=minute),0)>=3 then return false; end if;
  insert into public.ai_global_usage values(today,1) on conflict(usage_day) do update set requests=public.ai_global_usage.requests+1;
  insert into public.ai_daily_usage values(actor,today,1) on conflict(user_id,usage_day) do update set requests=public.ai_daily_usage.requests+1;
  insert into public.ai_minute_usage values(actor,minute,1) on conflict(user_id,usage_minute) do update set requests=public.ai_minute_usage.requests+1;
  delete from public.ai_minute_usage where usage_minute < now()-interval '1 day';
  delete from public.ai_daily_usage where usage_day < today-31;
  delete from public.ai_global_usage where usage_day < today-31;
  return true;
end $$;
revoke all on function public.reserve_ai_request(uuid) from public,anon,authenticated;
grant execute on function public.reserve_ai_request(uuid) to service_role;

-- Shared lookup rows are not user-owned writable content.
alter table public.categories enable row level security;
revoke insert,update,delete on public.categories from anon,authenticated;
grant select on public.categories to anon,authenticated;
create policy "categories are readable" on public.categories for select using(true);

-- Enforce record boundaries server-side too; direct RPC callers bypass client forms.
create function public.validate_purchase_record() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if NEW.purchase_price < 0 then raise exception 'Price cannot be negative' using errcode='23514'; end if;
  if NEW.record_data is not null then
    if jsonb_typeof(NEW.record_data) <> 'object' or octet_length(NEW.record_data::text)>524288 then
      raise exception 'Invalid or oversized record' using errcode='23514';
    end if;
    if jsonb_typeof(NEW.record_data->'documents') is distinct from 'array'
      or jsonb_typeof(NEW.record_data->'deadlines') is distinct from 'array' then
      raise exception 'Document and deadline arrays required' using errcode='23514';
    end if;
    if exists(select 1 from jsonb_array_elements(NEW.record_data->'documents') d where d ? 'uri') then
      raise exception 'Device file locations must not be uploaded' using errcode='23514';
    end if;
    if NEW.record_data->>'price' is not null and
      ((NEW.record_data->>'price')::numeric <> round((NEW.record_data->>'price')::numeric,2)) then
      raise exception 'Price must have at most two decimal places' using errcode='23514';
    end if;
  end if;
  return NEW;
end $$;
revoke all on function public.validate_purchase_record() from public;
create trigger validate_purchase_record before insert or update on public.purchases
for each row execute function public.validate_purchase_record();
