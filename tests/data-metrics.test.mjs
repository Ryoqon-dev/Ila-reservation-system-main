import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './account-helpers.mjs';
import {cloudflareUsage,usageLevel} from '../lib/data-metrics.mjs';
const token='MetricsToken_1234567890_abcd';
const sample=()=>Response.json({data:{viewer:{accounts:[{d1AnalyticsAdaptiveGroups:[{sum:{rowsRead:1234,rowsWritten:56}}],workersInvocationsAdaptive:[{sum:{requests:789,errors:2},quantiles:{cpuTimeP99:4500}}]}]}},errors:null});
const setup=async()=>{const f=await fixture();f.config.metricsFetch=async()=>sample();return f};
const connect=f=>f.call('saveMetricsLink',{accountId:'a'.repeat(32),token,adminPassword:'admin-test-password'});
test('Cloudflare metrics use the fixed HTTPS endpoint, account-wide UTC daily filters and safe numeric summaries',async()=>{
 let call;const r=await cloudflareUsage('a'.repeat(32),token,async(url,options)=>{call={url,options};return sample()});assert.equal(call.url,'https://api.cloudflare.com/client/v4/graphql');assert.equal(call.options.redirect,'manual');assert.match(JSON.parse(call.options.body).query,/rowsRead rowsWritten/);assert.doesNotMatch(JSON.parse(call.options.body).query,/scriptName|databaseId/);assert.equal(r.rowsRead,1234);assert.equal(r.rowsWritten,56);assert.equal(r.workerRequests,789);assert.equal(r.cpuP99Ms,4.5);assert.doesNotMatch(JSON.stringify(r),/MetricsToken|Authorization/);
});
test('metric link stores only an encrypted token, requires admin password, and never exports credential fields',async()=>{
 const f=await setup();assert.equal((await f.call('saveMetricsLink',{accountId:'a'.repeat(32),token,adminPassword:'wrong'})).status,403);assert.equal((await connect(f)).status,200);
 const stored=f.sqlite.prepare('SELECT * FROM data_metrics').get();assert.notEqual(stored.token_cipher,token);assert.doesNotMatch(JSON.stringify(stored),/MetricsToken/);
 for(const op of ['metricsLink','cloudUsage','dataOverview']){const r=await f.call(op,{},'admin','GET');assert.equal(r.status,200);assert.doesNotMatch(JSON.stringify(r.body),/MetricsToken|token_cipher|password_hash/)}
 const csv=await f.call('dataExport',{kind:'audit',from:'2020-01-01',to:'2035-01-01'});assert.doesNotMatch(JSON.stringify(csv.body),/MetricsToken|token_cipher/);
 assert.equal((await f.call('removeMetricsLink',{adminPassword:'admin-test-password'})).status,200);assert.equal((await f.call('cloudUsage',{},'admin','GET')).body.connected,false);
});
test('cached metrics avoid repeated external calls, and failures report stale data instead of zero usage',async()=>{
 const f=await setup();let n=0;f.config.metricsFetch=async()=>{n++;return sample()};await connect(f);await f.call('cloudUsage',{},'admin','GET');assert.equal(n,1);
 f.sqlite.prepare('UPDATE data_metrics SET refreshed_at=?').run('2020-01-01T00:00:00Z');f.config.metricsFetch=async()=>{throw new Error('offline '+token)};const r=await f.call('cloudUsage',{},'admin','GET');assert.equal(r.status,200);assert.equal(r.body.stale,true);assert.equal(r.body.usage.rowsRead,1234);assert.doesNotMatch(JSON.stringify(r.body),/MetricsToken|offline/);
});
test('the previous UTC day is never labelled as today when refresh fails',async()=>{
 const f=await setup();await connect(f);const cache=JSON.parse(f.sqlite.prepare('SELECT cache FROM data_metrics').get().cache);cache.date='2000-01-01';f.sqlite.prepare('UPDATE data_metrics SET cache=?').run(JSON.stringify(cache));f.config.metricsFetch=async()=>{throw new Error('offline')};const r=await f.call('cloudUsage',{},'admin','GET');assert.equal(r.body.stale,true);assert.equal(r.body.usage,null);
});
test('permission, malformed data and network failures are explicit; warning levels have exact boundaries',async()=>{
 await assert.rejects(cloudflareUsage('a'.repeat(32),token,async()=>Response.json({errors:[{message:'denied'}]})),/권한/);await assert.rejects(cloudflareUsage('a'.repeat(32),token,async()=>new Response('no',{status:403})),/권한/);await assert.rejects(cloudflareUsage('a'.repeat(32),token,async()=>Response.json({data:{}})),/형식/);
 assert.deepEqual([.69,.70,.85,.95,1.1].map(usageLevel),['normal','notice','warning','danger','danger']);
});
test('redirect responses are rejected without exposing their location or retrying another URL',async()=>{
 let calls=0;
 await assert.rejects(cloudflareUsage('a'.repeat(32),token,async()=>{calls++;return new Response(null,{status:307,headers:{location:'https://other.invalid/'+token}})}),error=>error.status===502&&/다른 주소/.test(error.message)&&!error.message.includes(token));
 assert.equal(calls,1);
});
test('non-JSON and null upstream responses report safe response errors',async()=>{
 await assert.rejects(cloudflareUsage('a'.repeat(32),token,async()=>new Response('<html>'+token+'</html>')),error=>error.status===502&&/응답/.test(error.message)&&!error.message.includes(token));
 await assert.rejects(cloudflareUsage('a'.repeat(32),token,async()=>Response.json(null)),error=>error.status===502&&/형식/.test(error.message));
});
test('request timeout is distinguished from network failure without exposing a token',async()=>{
 await assert.rejects(cloudflareUsage('a'.repeat(32),token,async()=>{throw new DOMException('private '+token,'AbortError')}),error=>error.status===504&&/8초/.test(error.message)&&!error.message.includes(token));
 await assert.rejects(cloudflareUsage('a'.repeat(32),token,async()=>{throw new Error('private '+token)}),error=>error.status===502&&/연결/.test(error.message)&&!error.message.includes(token));
});
