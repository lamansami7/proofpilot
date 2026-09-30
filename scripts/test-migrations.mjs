// Runs real PostgreSQL RLS / PLpgSQL in PGlite, not a mocked repository.
// Auth and Storage schemas below are minimal test harnesses, NOT Supabase services.
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
let assertions = 0;
const check = (value, message) => { assert.ok(value, message); assertions++; };
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    grant usage on schema public,auth,storage to authenticated,anon;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
  `);
  for (const file of (await readdir(new URL('../supabase/migrations/', import.meta.url))).sort()) {
    let sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
    // gen_random_uuid is built into PostgreSQL. PGlite doesn't ship pgcrypto;
    // no other pgcrypto function is used by these migrations.
    sql = sql.replace('create extension if not exists pgcrypto;', '');
    await db.exec(sql);
  }
  const a = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const b = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  await db.query('insert into auth.users(id) values ($1),($2)', [a,b]);
  // The bucket row the migration ships: privacy, size and type limits are declaration-level
  // evidence here; the Storage service enforcing them on upload requires the hosted service.
  const bucketRow = (await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id='purchase-documents'")).rows[0];
  check(bucketRow && bucketRow.public === false,'purchase-documents bucket stays private');
  check(Number(bucketRow.file_size_limit) === 20971520,'purchase-documents bucket declares the 20 MiB size limit');
  check(JSON.stringify(bucketRow.allowed_mime_types) === JSON.stringify(['application/pdf','image/jpeg','image/png']),'purchase-documents bucket allows only PDF, JPEG and PNG');
  const asUser = async id => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); };
  const save = async (id, name='Owned record') => db.query('select public.save_purchase_record($1::jsonb)',[JSON.stringify({ id, name, price: 0, purchaseDate: '2026-01-01', documents: [], deadlines: [] })]);
  const count = async table => Number((await db.query(`select count(*) as n from public.${table}`)).rows[0].n);
  const denied = async (operation, message) => { let failed = false; try { await operation(); } catch { failed = true; } check(failed,message); };
  await asUser(a);
  await denied(() => db.exec("insert into public.categories(name) values ('Corrupted')"),'Users cannot mutate shared categories');
  await denied(() => db.query('select public.save_purchase_record($1::jsonb)',[JSON.stringify({id:'negative',name:'Invalid',price:-1,documents:[],deadlines:[]})]),'Server rejects negative price');
  await denied(() => db.query('select public.save_purchase_record($1::jsonb)',[JSON.stringify({id:'uri',name:'Invalid',documents:[{uri:'file:///private'}],deadlines:[]})]),'Server rejects local file paths');
  await db.query("insert into storage.objects(bucket_id,name) values ('purchase-documents',$1)",[`${a}/receipt.pdf`]);
  await denied(() => db.query("insert into storage.objects(bucket_id,name) values ('purchase-documents',$1)",[`${b}/injected.pdf`]),'A cannot upload into B storage prefix');
  // Nested folders stay scoped to the first path segment (the owner's user id).
  await db.query("insert into storage.objects(bucket_id,name) values ('purchase-documents',$1)",[`${a}/nested/deeper/receipt.pdf`]);
  await denied(() => db.query("insert into storage.objects(bucket_id,name) values ('purchase-documents',$1)",[`${b}/nested/injected.pdf`]),'A cannot upload into B nested storage folders');
  const ownerRewrite = await db.query("update storage.objects set name='rewritten.pdf' where name=$1 returning id",[`${a}/receipt.pdf`]);
  check(ownerRewrite.rows.length === 0,'Storage rows have no update policy: not even the owner can modify them');
  await save('local-test'); await save('local-test','Retried');
  check(await count('purchases') === 1,'Save retry is idempotent');
  const pid = (await db.query('select id from public.purchases')).rows[0].id;
  await asUser(b);
  check(await count('purchases') === 0,'B cannot read A');
  check((await db.query('select * from storage.objects')).rows.length===0,'B cannot read A storage objects');
  const foreignDelete = await db.query('delete from storage.objects where name=$1 returning id',[`${a}/receipt.pdf`]);
  check(foreignDelete.rows.length === 0,'B cannot delete A storage objects');
  const foreignNestedDelete = await db.query('delete from storage.objects where name=$1 returning id',[`${a}/nested/deeper/receipt.pdf`]);
  check(foreignNestedDelete.rows.length === 0,'B cannot delete A nested storage objects');
  const foreignModify = await db.query("update storage.objects set name='stolen.pdf' where name=$1 returning id",[`${a}/receipt.pdf`]);
  check(foreignModify.rows.length === 0,'B cannot modify A storage objects');
  await denied(() => save(pid,'Attacker'),'B cannot overwrite A through RPC');
  await db.query('update public.purchases set product_name=$1 where id=$2',['Attacker',pid]);
  await db.query('select public.delete_purchase_record($1)',[pid]);
  await asUser(a);
  check((await db.query('select product_name from public.purchases')).rows[0].product_name === 'Retried','B cannot update/delete A');
  const aFiles = await db.query('select count(*)::int as n from storage.objects');
  check(aFiles.rows[0].n === 2,'A storage objects survive B delete/modify attempts');
  // Deletion receipts: service-role only, never readable or writable by clients.
  await denied(() => db.query('select * from public.account_deletion_receipts'),'Authenticated client cannot read deletion receipts');
  await denied(() => db.query("insert into public.account_deletion_receipts(receipt_hash,user_id) values(repeat('0',64),$1)",[a]),'Authenticated client cannot write deletion receipts');
  await db.exec('reset role; set role anon');
  await denied(() => db.query('select * from public.account_deletion_receipts'),'Anonymous client cannot read deletion receipts');
  await denied(() => db.query("delete from public.account_deletion_receipts"),'Anonymous client cannot delete deletion receipts');
  await asUser(a);
  await db.query('select public.delete_purchase_record($1)',['local-test']);
  await db.query('select public.delete_purchase_record($1)',['local-test']);
  check(await count('purchases') === 0,'Delete is idempotent');
  check(await count('purchase_tombstones') === 1,'Delete creates persistent tombstone');
  await denied(() => save('local-test'),'Stale offline upload cannot resurrect deleted record');
  await denied(() => db.exec('delete from public.purchase_tombstones'),'Client cannot erase tombstones');
  await db.query('select public.delete_purchase_record($1)',['never-uploaded']);
  await denied(() => save('never-uploaded'),'Interrupted upload cannot resurrect deleted record');
  await save('fresh');
  await db.exec('delete from public.purchases');
  await denied(() => save('fresh'),'Direct table deletion also prevents resurrection');
  // Service-only quotas cannot be forged by clients.
  await denied(() => db.query('select public.reserve_ai_request($1)',[a]),'Authenticated user cannot reserve/modify server quota');
  await db.exec('reset role; set role service_role');
  // Receipt rows are written only here (service role) and must outlive auth.users.
  await db.query("insert into public.account_deletion_receipts(receipt_hash,user_id) values(repeat('a',64),$1)",[a]);
  await db.query("update public.account_deletion_receipts set completed_at=now() where user_id=$1",[a]);
  check(await count('account_deletion_receipts') === 1,'Service role records a completed deletion receipt');
  for (let n=0;n<3;n++) check((await db.query('select public.reserve_ai_request($1) as ok',[a])).rows[0].ok,'Quota accepts bounded reservation');
  check(!(await db.query('select public.reserve_ai_request($1) as ok',[a])).rows[0].ok,'Fourth request in minute is refused');
  await db.query('insert into public.account_deletion_requests(user_id) values($1)',[a]);
  await asUser(a);
  await denied(() => save('during-delete'),'Account closure prevents new purchase writes');
  await denied(() => db.query("insert into storage.objects(bucket_id,name) values ('purchase-documents',$1)",[`${a}/during-delete.pdf`]),'Closing account cannot upload new files');
  await denied(() => db.exec('delete from public.account_deletion_requests'),'Client cannot cancel account closure');
  await asUser(b);
  check((await db.query("select record_id from public.purchase_tombstones where record_id='local-test'")).rows.length === 0,'B cannot read A tombstones');
  await save('account-cascade');
  await db.exec('reset role; delete from auth.users');
  check(await count('purchases') === 0,'Account deletion cascades existing purchases');
  check(await count('purchase_tombstones') === 0,'Account deletion cascades tombstones');
  check(await count('account_deletion_receipts') === 1,'Deletion receipts survive account removal for lost-response verification');
  // PostgREST verifies only a JWT's signature, so a deleted account's unexpired token still reaches the database.
  // It must not be able to write or resurrect anything.
  await asUser(a);
  await denied(() => save('after-account-deletion'),'Deleted account cannot write through the RPC with a stale session');
  await denied(() => db.query("insert into public.purchases(user_id,product_name) values ($1,'Resurrect attempt')",[a]),'Deleted account cannot insert purchases with a stale session');
  await denied(() => db.query("insert into storage.objects(bucket_id,name) values ('purchase-documents',$1)",[`${a}/after-deletion.pdf`]),'Deleted account cannot upload files with a stale session');
  await db.exec('reset role');
  check(await count('purchases') === 0 && await count('purchase_tombstones') === 0,'Nothing reappears for a deleted account');
  console.log(`Migration checks: ${assertions} passed. Live Supabase Auth/Storage and concurrent connections still require integration testing.`);
} finally { await db.close(); }
