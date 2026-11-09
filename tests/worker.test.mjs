import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker.mjs';
test('private mode blocks every path without the independent access password',async()=>{
 let served=0;const env={SITE_PUBLIC:'false',PRIVATE_PASSWORD:'test-password',ASSETS:{fetch(){served++;return new Response('static')}}};
 for(const path of ['/','/assets/logo.png','/api/system?op=auth'])assert.equal((await worker.fetch(new Request('https://test.invalid'+path),env)).status,401);
 const res=await worker.fetch(new Request('https://test.invalid/',{headers:{authorization:'Basic '+btoa('ila-owner:test-password')}}),env);
 assert.equal(await res.text(),'static');assert.equal(served,1);
 assert.equal((await worker.fetch(new Request('https://test.invalid/',{headers:{authorization:'Basic broken'}}),env)).status,401);
});
test('public mode serves static content and rejects unknown API routes and methods',async()=>{
 const env={SITE_PUBLIC:'true',ASSETS:{fetch:()=>new Response('static')}};
 assert.equal(await (await worker.fetch(new Request('https://test.invalid/'),env)).text(),'static');
 assert.equal((await worker.fetch(new Request('https://test.invalid/api/unknown'),env)).status,404);
 assert.equal((await worker.fetch(new Request('https://test.invalid/api/system',{method:'DELETE'}),env)).status,405);
 assert.equal((await worker.fetch(new Request('https://test.invalid/api/system'),env)).status,503);
});
test('default deployment has no public hostname or preview and runs private gate before assets',()=>{
 const config=JSON.parse(readFileSync(new URL('../wrangler.example.json',import.meta.url)));
 assert.equal(config.workers_dev,false);assert.equal(config.preview_urls,false);assert.equal(config.vars.SITE_PUBLIC,'false');assert.equal(config.assets.run_worker_first,true);
 assert.ok(!config.routes);assert.ok(!config.account_id);
});
