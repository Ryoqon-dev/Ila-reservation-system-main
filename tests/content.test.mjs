import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './account-helpers.mjs';
import {handleApi} from '../lib/service.mjs';
import {DEFAULT_SITE,DEFAULT_IMAGES,IMAGE_LIMITS} from '../lib/site-defaults.mjs';
import {validateSiteSettings,imageDimensions} from '../lib/site-content.mjs';
const settings=()=>structuredClone(DEFAULT_SITE);
const payload=(patch={})=>({baseVersion:'initial',requestKey:crypto.randomUUID(),settings:settings(),images:{},...patch});
const get=(f,op='siteContent',p={},who='guest')=>f.call(op,p,who,'GET');
const image=()=>({mime:'image/png',base64:readFileSync(new URL('../public/assets/logo.png',import.meta.url)).toString('base64')});
const imageResponse=(f,url,headers={})=>handleApi(new Request('https://unit.test'+url,{headers}),f.db,{});

test('empty content tables use the original logos, slogan, term and notice without touching operational data',async()=>{
 const f=await fixture();const c=await f.club();const before=f.sqlite.prepare('SELECT * FROM club_accounts').get();const content=await get(f);
 assert.equal(content.status,200);assert.equal(content.body.version,'initial');assert.deepEqual(content.body.settings,DEFAULT_SITE);assert.deepEqual(content.body.images,DEFAULT_IMAGES);assert.equal(content.body.noticeVersion,'v8');assert.deepEqual(f.sqlite.prepare('SELECT * FROM club_accounts').get(),before);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM site_content').get().n,0);
});
test('only a current administrator can save branding; club/guest/forged identity requests are rejected',async()=>{
 const f=await fixture();const c=await f.club();await f.login(c.username);
 for(const who of ['guest','club'])assert.equal((await f.call('saveSiteContent',payload(),who)).status,401);
 assert.equal((await f.call('saveSiteContent',payload(),'guest','POST',{'oai-authenticated-user-email':'owner@test.invalid'})).status,401);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM site_content').get().n,0);
 await f.call('logout');assert.equal((await f.call('saveSiteContent',payload())).status,401);
});
test('term, name, slogan, labels and contact update together and are available publicly without credentials',async()=>{
 const f=await fixture();const value=settings();Object.assign(value,{term:'37',brand:'새이름',brandMark:'新',slogan:'새로운 열정으로 함께합니다.',institution:'선문대학교',department:'운영부',heroTitle:'새로운 제목\n다음 줄',contactUrl:'https://open.kakao.com/new-chat'});
 const r=await f.call('saveSiteContent',payload({settings:value}));assert.equal(r.status,200);const current=await get(f);assert.deepEqual(current.body.settings,value);assert.equal(current.body.version,r.body.version);assert.match(current.headers.get('cache-control'),/no-store/);assert.doesNotMatch(JSON.stringify(current.body),/password_hash|password_cipher|session_token|payload_hash/);
});
test('notice changes renew the read version while branding-only changes do not',async()=>{
 const f=await fixture();const first=settings();first.term='37';const a=await f.call('saveSiteContent',payload({settings:first}));assert.equal(a.status,200);assert.equal(a.body.noticeVersion,'v8');
 const second=structuredClone(first);second.notices[0].body='바뀐 공지를 확인해주세요.';const b=await f.call('saveSiteContent',payload({baseVersion:a.body.version,settings:second}));assert.equal(b.status,200);assert.match(b.body.noticeVersion,/^[a-f0-9]{64}$/);assert.notEqual(b.body.noticeVersion,a.body.noticeVersion);
 const third=structuredClone(second);third.noticeEnabled=false;const c=await f.call('saveSiteContent',payload({baseVersion:b.body.version,settings:third}));assert.notEqual(c.body.noticeVersion,b.body.noticeVersion);
});
test('notice list supports add, reorder, hide and removal as plain text',async()=>{
 const f=await fixture();const value=settings();value.notices=[{id:'new-notice',title:'새 공지',body:'첫 줄\n둘째 줄',enabled:true},{...value.notices[0],enabled:false}];
 const r=await f.call('saveSiteContent',payload({settings:value}));assert.equal(r.status,200);assert.deepEqual(r.body.settings.notices,value.notices);
});
test('stale settings are rejected instead of overwriting the newer administrator changes',async()=>{
 const f=await fixture();const one=payload();one.settings.term='37';const two=payload();two.settings.term='38';
 const a=await f.call('saveSiteContent',one);assert.equal(a.status,200);assert.equal((await f.call('saveSiteContent',two)).status,409);assert.equal((await get(f)).body.settings.term,'37');
});
test('network retries and simultaneous identical saves return one revision with one audit record',async()=>{
 const f=await fixture();const p=payload({images:{logo:image()}});const results=await Promise.all([f.call('saveSiteContent',p),f.call('saveSiteContent',p)]);assert.ok(results.every(r=>r.status===200));assert.equal(results[0].body.version,results[1].body.version);assert.equal((await f.call('saveSiteContent',p)).status,200);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='SAVE_SITE_CONTENT'").get().n,1);
 const altered=structuredClone(p);altered.settings.term='38';assert.equal((await f.call('saveSiteContent',altered)).status,409);
});
test('concurrent conflicting saves never mix text and images from two revisions',async()=>{
 const f=await fixture();const a=payload({images:{logo:image()}}),b=payload({images:{wordmark:image()}});a.settings.term='37';b.settings.term='38';const results=await Promise.all([f.call('saveSiteContent',a),f.call('saveSiteContent',b)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const current=(await get(f)).body;const slots=f.sqlite.prepare('SELECT slot FROM site_images').all();assert.equal(slots.length,1);assert.equal(slots[0].slot,current.settings.term==='37'?'logo':'wordmark');
});
test('uploaded images are served with the correct MIME, immutable revision, ETag and no executable content sniffing',async()=>{
 const f=await fixture();const file=image();const r=await f.call('saveSiteContent',payload({images:{logo:file}}));assert.equal(r.status,200);const url=r.body.images.logo;assert.match(url,/op=siteImage/);
 const response=await imageResponse(f,url);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('cache-control'),/immutable/);assert.match(response.headers.get('content-security-policy'),/sandbox/);assert.equal(Buffer.from(await response.arrayBuffer()).toString('base64'),file.base64);
 const etag=response.headers.get('etag');assert.equal((await imageResponse(f,url,{'if-none-match':etag})).status,304);assert.match((await imageResponse(f,url,{authorization:'Basic private-test'})).headers.get('cache-control'),/^private/);
 assert.equal((await imageResponse(f,'/api/system?op=siteImage&slot=logo&v='+'0'.repeat(64))).status,404);
});
test('replacing and restoring images keeps at most three current image records',async()=>{
 const f=await fixture();const a=await f.call('saveSiteContent',payload({images:{logo:image(),wordmark:image(),campus:image()}}));assert.equal(a.status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM site_images').get().n,3);
 const b=await f.call('saveSiteContent',payload({baseVersion:a.body.version,images:{logo:null}}));assert.equal(b.status,200);assert.equal(b.body.images.logo,DEFAULT_IMAGES.logo);assert.equal(b.body.images.wordmark,a.body.images.wordmark);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM site_images').get().n,2);assert.equal((await imageResponse(f,a.body.images.logo)).status,404);
});
test('invalid formats, SVG, fake MIME, malformed base64, oversized images and huge dimensions are rejected',async()=>{
 const f=await fixture();const source=Buffer.from(image().base64,'base64');const bomb=Buffer.from(source);bomb.writeUInt32BE(9000,16);
 const invalid=[{mime:'image/svg+xml',base64:btoa('<svg onload="alert(1)"></svg>')},{mime:'image/gif',base64:'R0lGODlh'},{mime:'image/jpeg',base64:source.toString('base64')},{mime:'image/png',base64:'not-base64!!'},{mime:'image/png',base64:bomb.toString('base64')},{mime:'image/png',base64:Buffer.alloc(IMAGE_LIMITS.logo+1).toString('base64')}];
 for(const file of invalid)assert.equal((await f.call('saveSiteContent',payload({images:{logo:file}}))).status,400);
 assert.equal((await f.call('saveSiteContent',payload({images:{notAllowed:image()}}))).status,400);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM site_images').get().n,0);
});
test('source validation rejects bad terms, unsafe links, excessive notices and malformed settings',()=>{
 for(const patch of [{term:'0'},{term:'036'},{term:'1000'},{contactUrl:'javascript:alert(1)'},{contactUrl:'data:text/html,bad'},{contactUrl:'https://user:password@example.com'},{brand:'x'.repeat(21)},{noticeEnabled:'true'},{notices:Array.from({length:11},(_,i)=>({id:'n'+i,title:'제목',body:'내용',enabled:true}))}])assert.throws(()=>validateSiteSettings({...settings(),...patch}));
 const duplicate=settings();duplicate.notices[1].id=duplicate.notices[0].id;assert.throws(()=>validateSiteSettings(duplicate));
});
test('failed audit storage rolls back text and all image changes atomically',async()=>{
 const f=await fixture();const a=await f.call('saveSiteContent',payload({images:{logo:image()}}));f.sqlite.exec("CREATE TRIGGER fail_content_audit BEFORE INSERT ON audit WHEN NEW.action='SAVE_SITE_CONTENT' BEGIN SELECT RAISE(ABORT,'private audit detail'); END;");
 const p=payload({baseVersion:a.body.version,images:{logo:null,campus:image()}});p.settings.term='37';const b=await f.call('saveSiteContent',p);assert.equal(b.status,500);assert.doesNotMatch(b.body.error,/private audit detail|SQLite/i);const current=(await get(f)).body;assert.equal(current.version,a.body.version);assert.equal(current.settings.term,'36');assert.deepEqual(f.sqlite.prepare('SELECT slot FROM site_images').all().map(x=>x.slot),['logo']);
});
test('administrator session revocation before the save transaction prevents any text or image write',async()=>{
 const f=await fixture();f.beforeBatch(()=>f.sqlite.exec('DELETE FROM sessions'));assert.equal((await f.call('saveSiteContent',payload({images:{logo:image()}}))).status,401);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM site_content').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM site_images').get().n,0);
});
test('large content requests require login before reading the body; normal endpoints keep the original size limit',async()=>{
 const f=await fixture();let reads=0;const stream=new ReadableStream({pull(c){reads++;c.enqueue(new Uint8Array(1000));},cancel(){}});
 const req=new Request('https://unit.test/api/system?op=saveSiteContent',{method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half'});assert.equal((await handleApi(req,f.db,{})).status,401);assert.ok(reads<3);
 const tooLarge=new Request('https://unit.test/api/system',{method:'POST',headers:{'content-type':'application/json','content-length':'40000'},body:' '.repeat(40000)});assert.equal((await handleApi(tooLarge,f.db,{})).status,413);
});
test('content saves reject cross-origin requests and an oversized body even for an administrator',async()=>{
 const f=await fixture();assert.equal((await f.call('saveSiteContent',payload(),'admin','POST',{origin:'https://evil.invalid'})).status,400);assert.equal((await f.call('saveSiteContent',payload(),'admin','POST',{'sec-fetch-site':'cross-site'})).status,400);
 const cookie=[...f.jars.get('admin')].map(([k,v])=>k+'='+v).join('; ');const req=new Request('https://unit.test/api/system?op=saveSiteContent',{method:'POST',headers:{'content-type':'application/json','content-length':'1700001',cookie},body:' '.repeat(1700001)});assert.equal((await handleApi(req,f.db,{})).status,413);
});
test('existing club accounts, reservations, penalties, encryption and site audience are not part of a branding save',async()=>{
 const f=await fixture();const c=await f.club();await f.call('book',f.book({clubId:c.clubId,force:true,reason:'기존 자료'}));await f.call('savePenalty',{clubId:c.clubId,date:'2026-01-01',content:'기존 벌점',points:10});const tables=['admins','clubs','club_accounts','bookings','booking_access','penalties'];const before=tables.map(t=>f.sqlite.prepare('SELECT * FROM '+t).all());
 assert.equal((await f.call('saveSiteContent',payload({images:{logo:image()}}))).status,200);assert.deepEqual(tables.map(t=>f.sqlite.prepare('SELECT * FROM '+t).all()),before);
});
test('real JPEG, lossy WebP and transparent lossless WebP files pass image validation and round trip intact',async()=>{
 const f=await fixture();const files=JSON.parse(readFileSync(new URL('./image-fixtures.json',import.meta.url),'utf8'));let baseVersion='initial';
 for(const file of files){assert.deepEqual(imageDimensions(new Uint8Array(Buffer.from(file.base64,'base64')),file.mime),{width:file.width,height:file.height});const r=await f.call('saveSiteContent',payload({baseVersion,images:{logo:{mime:file.mime,base64:file.base64}}}));assert.equal(r.status,200,file.name);baseVersion=r.body.version;const image=await imageResponse(f,r.body.images.logo);assert.equal(image.headers.get('content-type'),file.mime);assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'),file.base64)}
});
test('racing requests with the same key and different contents cannot mix images or overwrite the committed payload',async()=>{
 const f=await fixture();const a=payload({images:{logo:image()}}),b=payload({requestKey:a.requestKey,images:{wordmark:image()}});a.settings.term='37';b.settings.term='38';const results=await Promise.all([f.call('saveSiteContent',a),f.call('saveSiteContent',b)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const current=(await get(f)).body;assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM site_images').get().n,1);assert.equal(f.sqlite.prepare('SELECT slot FROM site_images').get().slot,current.settings.term==='37'?'logo':'wordmark');
});
test('non-string revision identifiers and malformed image maps fail validation without internal exceptions',async()=>{
 const f=await fixture();for(const patch of [{requestKey:[crypto.randomUUID()]},{baseVersion:[crypto.randomUUID()]},{requestKey:'-'.repeat(36)},{images:null},{images:[]},{images:{logo:{mime:'image/png',base64:123}}}]){const r=await f.call('saveSiteContent',payload(patch));assert.equal(r.status,400);assert.doesNotMatch(r.body.error,/TypeError|D1_ERROR|SQLITE/)}
});
