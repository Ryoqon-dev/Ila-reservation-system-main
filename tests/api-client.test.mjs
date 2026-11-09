import test from 'node:test';
import assert from 'node:assert/strict';
import {requestJson,fetchWithTimeout} from '../src/api-client.mjs';
test('expired session requests notify login flow while wrong login passwords do not',async()=>{
 let expired=0;
 const options={fetchImpl:async()=>Response.json({error:'관리자 로그인이 필요합니다.'},{status:401}),onSessionExpired:()=>expired++};
 await assert.rejects(requestJson('clubs',{},false,options),/로그인/);assert.equal(expired,1);
 await assert.rejects(requestJson('login',{},true,options),/로그인/);assert.equal(expired,1);
});
test('non-JSON gateway errors are reported without exposing HTML or JSON parser errors',async()=>{
 await assert.rejects(requestJson('day',{},false,{fetchImpl:async()=>new Response('<html>gateway failed</html>',{status:503})}),/서버 응답/);
});
test('request timeout aborts the network request with a recoverable message',async()=>{
 await assert.rejects(fetchWithTimeout('/api/system',{}, {timeoutMs:5,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))}),/같은 내용/);
});
test('booking retries retain their supplied request key and confirmation code',async()=>{
 const key=crypto.randomUUID();let payload;
 const result=await requestJson('book',{requestKey:key},true,{fetchImpl:async(url,init)=>{payload=JSON.parse(init.body);return Response.json({id:'R-TEST',bookingCode:'ab'.repeat(32)})}});
 assert.equal(payload.requestKey,key);assert.equal(payload.op,'book');assert.match(result.bookingCode,/^[a-f0-9]{64}$/);
});
test('expired club sessions identify the club flow and incorrect club passwords do not trigger logout events',async()=>{
 const scopes=[];const options={fetchImpl:async()=>Response.json({error:'다시 로그인해주세요.',scope:'club'},{status:401}),onSessionExpired:scope=>scopes.push(scope)};
 await assert.rejects(requestJson('myBookings',{},false,options),/로그인/);assert.deepEqual(scopes,['club']);
 await assert.rejects(requestJson('clubLogin',{username:'wrong',password:'wrong'},true,options),/로그인/);assert.deepEqual(scopes,['club']);
});
test('pending-member permission errors preserve the signed-in session',async()=>{
 let expired=0;await assert.rejects(requestJson('book',{},true,{fetchImpl:async()=>Response.json({error:'관리자 승인 후 예약할 수 있습니다.',scope:'club'},{status:403}),onSessionExpired:()=>expired++}),/승인/);assert.equal(expired,0);
});
test('site content saves use the dedicated authorized upload path and keep their request key',async()=>{
 const key=crypto.randomUUID();let sentUrl,sentBody;await requestJson('saveSiteContent',{requestKey:key,baseVersion:'initial'},true,{fetchImpl:async(url,init)=>{sentUrl=url;sentBody=JSON.parse(init.body);return Response.json({version:key})}});assert.equal(sentUrl,'/api/system?op=saveSiteContent');assert.equal(sentBody.op,'saveSiteContent');assert.equal(sentBody.requestKey,key);
});
test('rental permission rejection opens the rental popup without logging out the shared club account',async()=>{
 let expired=0;const events=[],before=globalThis.window;globalThis.window={dispatchEvent:event=>events.push(event.type)};
 try{await assert.rejects(requestJson('book',{},true,{fetchImpl:async()=>Response.json({error:'장소 대여 메뉴는 한 명만 입장 가능합니다.',scope:'rental'},{status:423}),onSessionExpired:()=>expired++}),/한 명만 입장/);assert.deepEqual(events,['ila-rental-blocked']);assert.equal(expired,0)}finally{if(before===undefined)delete globalThis.window;else globalThis.window=before}
});
