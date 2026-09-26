-- A versioned application record is saved atomically with the existing purchase row.
-- Device file URIs are deliberately excluded by the client. Existing relational
-- records remain readable; the snapshot becomes authoritative after an edit.
alter table public.purchases add column if not exists record_data jsonb;

create or replace function public.save_purchase_record(record jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare owner uuid := auth.uid(); pid uuid;
begin
  if owner is null then raise exception 'Authentication required'; end if;
  if nullif(trim(record->>'name'), '') is null then raise exception 'Product name required'; end if;
  pid := case when record->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (record->>'id')::uuid else md5(owner::text || ':' || (record->>'id'))::uuid end;
  insert into public.purchases(id, user_id, product_name, merchant, category, purchase_date, purchase_price, serial_number, model_number, notes, record_data)
  values(pid, owner, record->>'name', record->>'merchant', record->>'category', (record->>'purchaseDate')::date,
    (record->>'price')::numeric, record->>'serial', record->>'model', record->>'notes', record)
  on conflict(id) do update set product_name=excluded.product_name, merchant=excluded.merchant,
    category=excluded.category, purchase_date=excluded.purchase_date, purchase_price=excluded.purchase_price,
    serial_number=excluded.serial_number, model_number=excluded.model_number, notes=excluded.notes,
    record_data=excluded.record_data, updated_at=now();
end $$;

create or replace function public.delete_purchase_record(record_id text)
returns void language plpgsql security invoker set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  pid := case when record_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then record_id::uuid else md5(auth.uid()::text || ':' || record_id)::uuid end;
  delete from public.purchases where id=pid and user_id=auth.uid();
end $$;
revoke all on function public.save_purchase_record(jsonb) from public;
revoke all on function public.delete_purchase_record(text) from public;
grant execute on function public.save_purchase_record(jsonb) to authenticated;
grant execute on function public.delete_purchase_record(text) to authenticated;
