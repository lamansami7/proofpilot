import { createAIHandler } from './ai.ts';
import { createDeletionHandler } from './deletion.ts';
import { HttpError, readJson } from './http.ts';
function assert(value: unknown,message='Assertion failed'): asserts value { if (!value) throw new Error(message); }
const request=(path:string,body:unknown,headers:Record<string,string>={})=>new Request(`https://functions.test/${path}`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer verified.test.token',...headers},body:JSON.stringify(body)});
const identity={id:'verified-owner',passwordVerifiedAt:1000};
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
 const calls:string[]=[];const handler=createDeletionHandler({allowedOrigins:[],now:()=>1000000,authenticate:async()=>identity,begin:async id=>{calls.push(`begin:${id}`);},removeFiles:async id=>{calls.push(`files:${id}`);return true;},deleteUser:async id=>{calls.push(`auth:${id}`);}});
 assert((await handler(request('delete-account',{confirmation:'DELETE'}))).status===200);assert(calls.join(',')==='begin:verified-owner,files:verified-owner,auth:verified-owner');
});
Deno.test('deletion rejects target injection and stale password proof',async()=>{
 let calls=0;const deps={allowedOrigins:[],now:()=>2000000,authenticate:async()=>identity,begin:async()=>{calls++;},removeFiles:async()=>true,deleteUser:async()=>{calls++;}};
 assert((await createDeletionHandler(deps)(request('delete-account',{confirmation:'DELETE'}))).status===403);
 assert((await createDeletionHandler({...deps,now:()=>1000000})(request('delete-account',{confirmation:'DELETE',userId:'victim'}))).status===400);assert(calls===0);
});
Deno.test('storage failure/partial cleanup never deletes Auth; retry preserves ordering',async()=>{
 let authDeleted=0;let attempts=0;const handler=createDeletionHandler({allowedOrigins:[],now:()=>1000000,authenticate:async()=>identity,begin:async()=>{},removeFiles:async()=>++attempts>1,deleteUser:async()=>{authDeleted++;}});
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
 const handler=createDeletionHandler({allowedOrigins:[],now:()=>1000000,authenticate:async()=>identity,begin:async()=>{},removeFiles:async()=>true,deleteUser:async()=>{throw new Error('private');}});
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
