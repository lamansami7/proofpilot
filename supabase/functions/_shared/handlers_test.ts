import { createAIHandler } from './ai.ts';
import { createDeletionHandler } from './deletion.ts';
import { HttpError, readJson } from './http.ts';
function assert(value: unknown,message='Assertion failed'): asserts value { if (!value) throw new Error(message); }
const request=(path:string,body:unknown,headers:Record<string,string>={})=>new Request(`https://functions.test/${path}`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer verified.test.token',...headers},body:JSON.stringify(body)});
const identity={id:'verified-owner',passwordVerifiedAt:1000};
// A syntactically valid 32-byte base64url receipt (test vector, never a real secret).
const RECEIPT='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
type DeletionDeps=Parameters<typeof createDeletionHandler>[0];
const deletionDeps=(overrides:Partial<DeletionDeps>={}):DeletionDeps=>({
 allowedOrigins:[],now:()=>1000000,authenticate:async()=>identity,
 begin:async()=>{},removeFiles:async()=>true,deleteUser:async()=>{},
 receiptPending:async()=>{},receiptCompleted:async()=>{},receiptStatus:async()=>null,
 ...overrides,
});
const valid={context:{productName:'User entered product'},question:'What information is missing?'};
Deno.test('AI authenticates, validates and reserves before provider call; returns verified shape',async()=>{
 const calls:string[]=[]; const handler=createAIHandler({allowedOrigins:['https://app.test'],enabled:true,authenticate:async()=>{calls.push('auth');return identity;},reserve:async id=>{assert(id===identity.id);calls.push('quota');return true;},generate:async()=>{calls.push('provider');return {answer:'Review your terms.',knownFacts:[],missingInformation:['Policy']};}});
 const response=await handler(request('purchase-question',valid,{origin:'https://app.test'}));assert(response.status===200);assert(calls.join(',')==='auth,quota,provider');assert(response.headers.get('access-control-allow-origin')==='https://app.test');
});
for(const [name,body] of Object.entries({notes:{...valid,context:{productName:'X',notes:'private'}},file:{...valid,document:'contents'},oversize:{...valid,question:'x'.repeat(2001)},missing:{context:{productName:'X'}}})) Deno.test(`AI rejects ${name} before billable calls`,async()=>{
 let calls=0;const handler=createAIHandler({allowedOrigins:[],enabled:true,authenticate:async()=>identity,reserve:async()=>{calls++;return true;},generate:async()=>{calls++;return {};}});
 assert((await handler(request('purchase-question',body))).status===400);assert(calls===0);
});
Deno.test('origin denied, missing auth denied, rate limit stops provider',async()=>{
 let calls=0;const handler=createAIHandler({allowedOrigins:[],enabled:true,authenticate:async()=>identity,reserve:async()=>false,generate:async()=>{calls++;return {};}});
 assert((await handler(request('purchase-question',valid,{origin:'https://evil.test'}))).status===403);
 const noAuth=request('purchase-question',valid);noAuth.headers.delete('authorization');assert((await handler(noAuth)).status===401);
 assert((await handler(request('purchase-question',valid))).status===429);assert(calls===0);
});
Deno.test('unavailable and invalid provider output never fabricate success',async()=>{
 const deps={allowedOrigins:[],enabled:true,authenticate:async()=>identity,reserve:async()=>true,generate:async()=>({answer:'',knownFacts:[],missingInformation:[]})};
 assert((await createAIHandler({...deps,enabled:false})(request('purchase-question',valid))).status===503);
 assert((await createAIHandler(deps)(request('purchase-question',valid))).status===502);
});
Deno.test('deletion uses verified identity, freezes writes before cleanup, deletes Auth last',async()=>{
 const calls:string[]=[];const handler=createDeletionHandler(deletionDeps({begin:async id=>{calls.push(`begin:${id}`);},removeFiles:async id=>{calls.push(`files:${id}`);return true;},deleteUser:async id=>{calls.push(`auth:${id}`);}}));
 assert((await handler(request('delete-account',{confirmation:'DELETE'}))).status===200);assert(calls.join(',')==='begin:verified-owner,files:verified-owner,auth:verified-owner');
});
Deno.test('deletion rejects target injection and stale password proof',async()=>{
 let calls=0;const deps=deletionDeps({now:()=>2000000,begin:async()=>{calls++;},removeFiles:async()=>{calls++;return true;},deleteUser:async()=>{calls++;}});
 assert((await createDeletionHandler(deps)(request('delete-account',{confirmation:'DELETE'}))).status===403);
 assert((await createDeletionHandler({...deps,now:()=>1000000})(request('delete-account',{confirmation:'DELETE',userId:'victim'}))).status===400);assert(calls===0);
});
Deno.test('storage failure/partial cleanup never deletes Auth; retry preserves ordering',async()=>{
 let authDeleted=0;let attempts=0;const handler=createDeletionHandler(deletionDeps({removeFiles:async()=>++attempts>1,deleteUser:async()=>{authDeleted++;}}));
 assert((await handler(request('delete-account',{confirmation:'DELETE'}))).status===409);assert(authDeleted===0);
 assert((await handler(request('delete-account',{confirmation:'DELETE'}))).status===200);assert(Number(authDeleted)===1);
});
Deno.test('internal errors are redacted',async()=>{
 const handler=createAIHandler({allowedOrigins:[],enabled:true,authenticate:async()=>{throw new HttpError(401,'invalid_session');},reserve:async()=>true,generate:async()=>{throw new Error('secret');}});
 const response=await handler(request('purchase-question',valid));assert(response.status===401);assert(!(await response.text()).includes('secret'));
});
Deno.test('model-authored facts are replaced with user-provided context and a mandatory warning',async()=>{
 const handler=createAIHandler({allowedOrigins:[],enabled:true,authenticate:async()=>identity,reserve:async()=>true,generate:async()=>({answer:'Suggestion',knownFacts:['Invented lifetime warranty'],missingInformation:[]})});
 const response=await handler(request('purchase-question',valid));const body=await response.json();
 assert(body.answer.startsWith('AI-GENERATED GUIDANCE — VERIFY BEFORE USING'));
 assert(JSON.stringify(body.knownFacts)===JSON.stringify(['User-provided productName: User entered product']));
});
Deno.test('claim warning is enforced even when the model omits it',async()=>{
 const handler=createAIHandler({allowedOrigins:[],enabled:true,authenticate:async()=>identity,reserve:async()=>true,generate:async()=>({draft:'Suggestion',knownFacts:[],missingInformation:[]})});
 const response=await handler(request('claim-draft',{context:valid.context,type:'return'}));
 assert((await response.json()).draft.startsWith('DRAFT — VERIFY BEFORE SENDING'));
});
Deno.test('quota service failure never calls the provider',async()=>{
 let called=false;const handler=createAIHandler({allowedOrigins:[],enabled:true,authenticate:async()=>identity,reserve:async()=>{throw new Error('private');},generate:async()=>{called=true;return {};}});
 const response=await handler(request('purchase-question',valid));assert(response.status===503);assert(!called);assert(!(await response.text()).includes('private'));
});
Deno.test('Auth deletion failure cannot return confirmed success',async()=>{
 const handler=createDeletionHandler(deletionDeps({deleteUser:async()=>{throw new Error('private');}}));
 const response=await handler(request('delete-account',{confirmation:'DELETE'}));assert(response.status===503);assert(!(await response.text()).includes('private'));
});
Deno.test('JSON lookalike media types are rejected before quota reservation',async()=>{
 let called=false;const handler=createAIHandler({allowedOrigins:[],enabled:true,authenticate:async()=>identity,reserve:async()=>{called=true;return true;},generate:async()=>({})});
 assert((await handler(request('purchase-question',valid,{'content-type':'application/jsonp'}))).status===415);assert(!called);
});

Deno.test('provider response reader bounds bytes even without Content-Length',async()=>{
 let rejected=false;
 try { await readJson(new Response(JSON.stringify({text:'x'.repeat(100)}),{headers:{'content-type':'application/json'}}),32); }
 catch (error) { rejected=error instanceof HttpError && error.status===413; }
 assert(rejected);
});
Deno.test('provider response reader rejects non-object JSON',async()=>{
 let rejected=false;
 try { await readJson(new Response('[]',{headers:{'content-type':'application/json'}})); }
 catch (error) { rejected=error instanceof HttpError && error.status===400; }
 assert(rejected);
});

// Deletion service: every rejection path must leave cloud state untouched, and
// only the caller's own verified identity may ever be the deletion target.
Deno.test('deletion requires a bearer token and performs no work without one',async()=>{
 let calls=0;const handler=createDeletionHandler(deletionDeps({begin:async()=>{calls++;},removeFiles:async()=>{calls++;return true;},deleteUser:async()=>{calls++;}}));
 const missing=request('delete-account',{confirmation:'DELETE'});missing.headers.delete('authorization');
 assert((await handler(missing)).status===401);
 const malformed=request('delete-account',{confirmation:'DELETE'},{authorization:'Bearer not a token'});
 assert((await handler(malformed)).status===401);
 assert(calls===0);
});
Deno.test('deletion refuses a session with no recent password proof',async()=>{
 let calls=0;const handler=createDeletionHandler(deletionDeps({authenticate:async()=>({id:identity.id,passwordVerifiedAt:null}),begin:async()=>{calls++;},removeFiles:async()=>{calls++;return true;},deleteUser:async()=>{calls++;}}));
 assert((await handler(request('delete-account',{confirmation:'DELETE'}))).status===403);
 assert(calls===0);
});
Deno.test('deletion refuses an unlisted origin before any cloud work',async()=>{
 let calls=0;const handler=createDeletionHandler(deletionDeps({allowedOrigins:['https://app.test'],begin:async()=>{calls++;},removeFiles:async()=>{calls++;return true;},deleteUser:async()=>{calls++;}}));
 assert((await handler(request('delete-account',{confirmation:'DELETE'},{origin:'https://evil.test'}))).status===403);
 assert(calls===0);
});
Deno.test('deletion refuses a non-JSON body before any cloud work',async()=>{
 let calls=0;const handler=createDeletionHandler(deletionDeps({begin:async()=>{calls++;},removeFiles:async()=>{calls++;return true;},deleteUser:async()=>{calls++;}}));
 assert((await handler(request('delete-account',{confirmation:'DELETE'},{'content-type':'text/plain'}))).status===415);
 assert((await handler(request('delete-account',{confirmation:'delete'}))).status===400);
 assert(calls===0);
});
Deno.test('deletion never signs out or deletes a different account than the verified caller',async()=>{
 const targets:string[]=[];const handler=createDeletionHandler(deletionDeps({authenticate:async()=>({id:'verified-owner',passwordVerifiedAt:1000}),begin:async id=>{targets.push(id);},removeFiles:async id=>{targets.push(id);return true;},deleteUser:async id=>{targets.push(id);}}));
 assert((await handler(request('delete-account',{confirmation:'DELETE',userId:'victim',email:'victim@example.com'}))).status===400);
 assert(targets.length===0);
 assert((await handler(request('delete-account',{confirmation:'DELETE'}))).status===200);
 assert(targets.every(target=>target==='verified-owner'));
});

// Lost-final-response recovery: the client-held receipt is the ONLY accepted proof of
// completion — never a failed sign-in — and the status probe performs no cloud work.
Deno.test('deletion with a receipt records pending first and completes only after Auth deletion',async()=>{
 const calls:string[]=[];let stored:{userId:string;completedAt:string|null}|null=null;
 const handler=createDeletionHandler(deletionDeps({
  begin:async id=>{calls.push(`begin:${id}`);},
  receiptPending:async(_hash,id)=>{calls.push(`pending:${id}`);stored={userId:id,completedAt:null};},
  removeFiles:async id=>{calls.push(`files:${id}`);return true;},
  deleteUser:async id=>{calls.push(`auth:${id}`);},
  receiptCompleted:async()=>{calls.push('completed');if(stored)stored.completedAt='2026-09-30T00:00:00Z';},
  receiptStatus:async()=>stored,
 }));
 const response=await handler(request('delete-account',{confirmation:'DELETE',receipt:RECEIPT}));
 assert(response.status===200);assert((await response.json()).deleted===true);
 assert(calls.join(',')==='begin:verified-owner,pending:verified-owner,files:verified-owner,auth:verified-owner,completed');
 const before=calls.length;
 const probe=request('delete-account',{receipt:RECEIPT});probe.headers.delete('authorization');
 const status=await handler(probe);assert(status.status===200);
 const body=await status.json();
 assert(body.deleted===true&&body.state==='completed'&&body.userId==='verified-owner');
 assert(calls.length===before,'status probe performed cloud work');
});
Deno.test('receipt status distinguishes pending from unknown and never confirms either',async()=>{
 let begin=0,files=0,auth=0;
 const pendingHandler=createDeletionHandler(deletionDeps({begin:async()=>{begin++;},removeFiles:async()=>{files++;return true;},deleteUser:async()=>{auth++;},receiptStatus:async()=>({userId:'verified-owner',completedAt:null})}));
 const probe=request('delete-account',{receipt:RECEIPT});probe.headers.delete('authorization');
 const pending=await pendingHandler(probe);assert(pending.status===200);
 const pendingBody=await pending.json();
 assert(pendingBody.deleted===false&&pendingBody.state==='pending'&&pendingBody.userId==='verified-owner');
 const unknownHandler=createDeletionHandler(deletionDeps({begin:async()=>{begin++;},removeFiles:async()=>{files++;return true;},deleteUser:async()=>{auth++;}}));
 const unknownProbe=request('delete-account',{receipt:RECEIPT});unknownProbe.headers.delete('authorization');
 const unknown=await unknownHandler(unknownProbe);assert(unknown.status===200);
 const unknownBody=await unknown.json();
 assert(unknownBody.deleted===false&&unknownBody.state==='unknown'&&unknownBody.userId===undefined);
 assert(begin===0&&files===0&&auth===0,'status probe performed destructive work');
});
Deno.test('status probe is refused for a non-POST method and a bad origin',async()=>{
 const handler=createDeletionHandler(deletionDeps({allowedOrigins:['https://app.test']}));
 assert((await handler(new Request('https://functions.test/delete-account'))).status===405);
 const evil=request('delete-account',{receipt:RECEIPT},{origin:'https://evil.test'});
 assert((await handler(evil)).status===403);
});
Deno.test('a malformed receipt is rejected before any work',async()=>{
 let calls=0;const handler=createDeletionHandler(deletionDeps({begin:async()=>{calls++;},removeFiles:async()=>{calls++;return true;},deleteUser:async()=>{calls++;},receiptPending:async()=>{calls++;}}));
 const badStatus=request('delete-account',{receipt:'not-a-receipt'});badStatus.headers.delete('authorization');
 assert((await handler(badStatus)).status===400);
 assert((await handler(request('delete-account',{confirmation:'DELETE',receipt:'not-a-receipt'}))).status===400);
 const numeric=request('delete-account',{receipt:12345});numeric.headers.delete('authorization');
 assert((await handler(numeric)).status===400);
 assert(calls===0);
});
Deno.test('a failed pending-receipt write aborts before destructive work',async()=>{
 let files=0,auth=0;const handler=createDeletionHandler(deletionDeps({receiptPending:async()=>{throw new Error('private');},removeFiles:async()=>{files++;return true;},deleteUser:async()=>{auth++;}}));
 const response=await handler(request('delete-account',{confirmation:'DELETE',receipt:RECEIPT}));
 assert(response.status===503);assert((await response.json()).deleted===undefined);
 assert(files===0&&auth===0);
});
Deno.test('a failed completion write never reports successful deletion',async()=>{
 const handler=createDeletionHandler(deletionDeps({deleteUser:async()=>{},receiptCompleted:async()=>{throw new Error('private');}}));
 const response=await handler(request('delete-account',{confirmation:'DELETE',receipt:RECEIPT}));
 assert(response.status===503);
 const body=await response.json();
 assert(body.deleted!==true&&body.error==='deletion_incomplete_retry');
 assert(!(JSON.stringify(body)).includes('private'));
});
