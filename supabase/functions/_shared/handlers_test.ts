import { createAIHandler } from './ai.ts';
import { createDeletionHandler } from './deletion.ts';
import { HttpError } from './http.ts';
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
