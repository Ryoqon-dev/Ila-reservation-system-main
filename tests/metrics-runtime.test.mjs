import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {realpathSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const require=createRequire(realpathSync(new URL('../node_modules/wrangler/package.json',import.meta.url)));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
test('real Workers fetch accepts the metrics request and never forwards a token across redirects',async()=>{
 const calls=[];let redirect=false;
 const root=fileURLToPath(new URL('../',import.meta.url));
 const modules=['tests/metrics-runtime-worker.mjs','lib/data-metrics.mjs','lib/rules.mjs','lib/common/input.mjs','lib/modules/accounts/credentials.mjs','lib/security.mjs'].map(name=>({type:'ESModule',path:root+name,contents:readFileSync(root+name,'utf8')}));
 const options={modules,modulesRoot:root,compatibilityDate:'2026-05-15',cf:false,
  outboundService:async request=>{
   calls.push({url:request.url,authorization:request.headers.get('authorization')});
   if(redirect)return new Response(null,{status:302,headers:{location:'https://other.invalid/collect'}});
   return Response.json({data:{viewer:{accounts:[{d1AnalyticsAdaptiveGroups:[{sum:{rowsRead:12,rowsWritten:3}}],workersInvocationsAdaptive:[{sum:{requests:9,errors:0},quantiles:{cpuTimeP99:2000}}]}]}},errors:null});
  }};
 const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(options):options);
 try{
  let response=await mf.dispatchFetch('https://unit.test/');assert.equal(response.status,200);let body=await response.json();assert.equal(body.ok,true);assert.equal(body.usage.rowsRead,12);assert.equal(body.usage.workerRequests,9);assert.equal(body.usage.cpuP99Ms,2);
  assert.deepEqual(calls,[{url:'https://api.cloudflare.com/client/v4/graphql',authorization:'Bearer test-only-metrics-token'}]);
  redirect=true;response=await mf.dispatchFetch('https://unit.test/');assert.equal(response.status,502);body=await response.json();assert.match(body.error,/다른 주소/);assert.equal(calls.length,2);assert.ok(calls.every(call=>call.url==='https://api.cloudflare.com/client/v4/graphql'));assert.doesNotMatch(JSON.stringify(body),/test-only-metrics-token|collect/);
 }finally{await mf.dispose()}
});
