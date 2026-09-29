// Destructive only to this run's unique QA records. Use a dedicated STAGING project.
// Two email-confirmed test users must already exist. Never use customer accounts.
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { stagingConfigured } from './release-config.mjs';
import { loadLocalEnv } from './load-local-env.mjs';
import { liveFailureMessage } from './live-report.mjs';
loadLocalEnv();
const env=process.env;
if (!stagingConfigured(env)) {
 console.error('Not run: explicitly identify PROOFPILOT_STAGING_PROJECT_REF, matching public Supabase URL/key, staging opt-in and two dedicated test accounts.');process.exit(2);
}
const make=()=>createClient(env.EXPO_PUBLIC_SUPABASE_URL,env.EXPO_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const a=make(),b=make();const record={id:`qa-${crypto.randomUUID()}`,name:'QA isolation test — safe to delete',price:0,purchaseDate:'2026-01-01',documents:[],deadlines:[]};
// Stage names are fixed literals, so a failure report can never contain a token, an email or record content.
let stage='startup';
try {
 stage='sign in dedicated test accounts';for (const [client,label] of [[a,'A'],[b,'B']]) { const {error}=await client.auth.signInWithPassword({email:env[`PROOFPILOT_TEST_EMAIL_${label}`],password:env[`PROOFPILOT_TEST_PASSWORD_${label}`]});if(error)throw new Error(`Staging user ${label} could not sign in; check verified email and configuration.`); }
 stage='confirm two distinct authenticated identities';const ownerA=(await a.auth.getUser()).data.user?.id,ownerB=(await b.auth.getUser()).data.user?.id;assert.ok(ownerA&&ownerB&&ownerA!==ownerB);
 stage='idempotent save';for(let i=0;i<2;i++)assert.equal((await a.rpc('save_purchase_record',{record})).error,null);
 stage='single stored row after retried save';const rows=await a.from('purchases').select('id,record_data').eq('record_data->>id',record.id);assert.equal(rows.error,null);assert.equal(rows.data.length,1);const pid=rows.data[0].id;
 stage='cross-account read denial';const foreign=await b.from('purchases').select('id').eq('id',pid);assert.equal(foreign.error,null);assert.equal(foreign.data.length,0);
 stage='cross-account write denial';assert.ok((await b.rpc('save_purchase_record',{record:{...record,id:pid,name:'Unauthorized'}})).error);
 stage='cross-account delete is a no-op';assert.equal((await b.rpc('delete_purchase_record',{record_id:pid})).error,null);
 stage='owner still sees its row after the foreign delete';assert.equal((await a.from('purchases').select('id').eq('id',pid)).data.length,1);
 stage='idempotent delete';for(let i=0;i<2;i++)assert.equal((await a.rpc('delete_purchase_record',{record_id:record.id})).error,null);
 stage='stale resurrection denial';assert.ok((await a.rpc('save_purchase_record',{record})).error);
 stage='tombstone visible to its owner and hidden from the other account';const tombstones=await a.from('purchase_tombstones').select('record_id').eq('record_id',record.id);assert.equal(tombstones.error,null);assert.equal(tombstones.data.length,1);
 assert.equal((await b.from('purchase_tombstones').select('record_id').eq('record_id',record.id)).data.length,0);
 console.log('Live staging checks passed: two-user isolation, idempotent save/delete, tombstone isolation and stale resurrection denial. Not an email/device/full release certification.');
} catch (error) {
 console.error(liveFailureMessage(stage,error));
 process.exitCode=1;
} finally { stage='cleanup';await a.rpc('delete_purchase_record',{record_id:record.id});await a.auth.signOut({scope:'local'});await b.auth.signOut({scope:'local'}); }
