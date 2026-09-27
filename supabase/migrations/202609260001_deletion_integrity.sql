-- Deletion wins permanently for a record ID. Restore as a NEW ID, never revive an old ID.
-- Apply after both existing migrations. No destructive data rewrite.
create table public.purchase_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null,
  record_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, purchase_id)
);
alter table public.purchase_tombstones enable row level security;
create policy "owner reads tombstones" on public.purchase_tombstones
  for select to authenticated using (user_id = auth.uid());
revoke all on public.purchase_tombstones from anon, authenticated;
grant select on public.purchase_tombstones to authenticated;
create index purchase_tombstones_record_idx on public.purchase_tombstones(user_id, record_id);
create index if not exists purchases_owner_idx on public.purchases(user_id);

-- This release has no sharing UI/consent flow. Disable legacy household reads.
drop policy "purchase access" on public.purchases;
create policy "purchase access" on public.purchases for select to authenticated using(user_id=auth.uid());
create or replace function public.can_access_purchase(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.purchases where id=pid and user_id=auth.uid())
$$;

create function public.guard_purchase_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner uuid; pid uuid;
begin
  if TG_OP = 'DELETE' then owner := OLD.user_id; pid := OLD.id;
  else owner := NEW.user_id; pid := NEW.id; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text || ':' || pid::text, 0));
  if TG_OP = 'DELETE' then
    -- Auth-user cascading deletion must not recreate data for the removed account.
    if exists(select 1 from auth.users where id=owner) then
      insert into public.purchase_tombstones(user_id,purchase_id,record_id)
      values(owner,pid,coalesce(OLD.record_data->>'id',pid::text)) on conflict do nothing;
    end if;
    return OLD;
  end if;
  if exists(select 1 from public.purchase_tombstones where user_id=owner and purchase_id=pid) then
    raise exception 'This record was deleted. Refresh before saving; restore with a new ID.' using errcode='23514';
  end if;
  return NEW;
end $$;
revoke all on function public.guard_purchase_deletion() from public;
create trigger purchase_deletion_guard before insert or update or delete on public.purchases
for each row execute function public.guard_purchase_deletion();

-- Security definer is limited to the authenticated caller's own ID, with fixed search_path.
-- A tombstone is written even when an interrupted upload never created a purchase row.
create or replace function public.delete_purchase_record(record_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid := auth.uid(); pid uuid;
begin
  if owner is null then raise exception 'Authentication required'; end if;
  if record_id is null or length(record_id) not between 1 and 200 then raise exception 'Invalid record ID'; end if;
  pid := case when record_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then record_id::uuid else md5(owner::text || ':' || record_id)::uuid end;
  perform pg_advisory_xact_lock(hashtextextended(owner::text || ':' || pid::text, 0));
  insert into public.purchase_tombstones(user_id,purchase_id,record_id)
    values(owner,pid,record_id) on conflict do nothing;
  delete from public.purchases where id=pid and user_id=owner;
end $$;
revoke all on function public.delete_purchase_record(text) from public;
grant execute on function public.delete_purchase_record(text) to authenticated;

-- Legacy document metadata cannot be re-parented onto another account's purchase.
drop policy "documents owner update" on public.documents;
create policy "documents owner update" on public.documents for update to authenticated
using(user_id=auth.uid() and public.can_access_purchase(purchase_id))
with check(user_id=auth.uid() and public.can_access_purchase(purchase_id));
