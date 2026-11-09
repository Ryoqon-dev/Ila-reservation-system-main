import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './account-helpers.mjs';
import {DEFAULT_SITE} from '../lib/site-defaults.mjs';
const get=(f,p={},who='club')=>f.call('myClub',p,who,'GET');
const photo=(f,clubId,overrides={})=>{const row={id:crypto.randomUUID(),clubId,date:'2026-01-02',content:'사진 미제출',points:10,voided:0,...overrides};f.sqlite.prepare("INSERT INTO penalties(id,club_id,date,content,points,kind,source_key,voided,created_at) VALUES (?,?,?,?,?,'photo',?, ?,?)").run(row.id,row.clubId,row.date,f.seedPenaltyText,row.points,'photo:'+row.id,row.voided,'2026-01-02T10:00:00Z');return row.id};
const inspection=async(f,clubId,points=7,content='동방 청소 미흡')=>{const r=await f.call('savePenalty',{clubId,date:'2026-01-03',points,content});assert.equal(r.status,200);return r};
const force=async(f,clubId,patch={})=>{const r=await f.call('book',f.book({clubId,force:true,reason:'관리자 테스트',...patch}));assert.equal(r.status,200,JSON.stringify(r.body));return r.body};

test('private club dashboard requires an approved club login; administrator login alone is insufficient',async()=>{
 const f=await fixture();assert.equal((await get(f,{},'guest')).status,401);assert.equal((await get(f,{},'admin')).status,401);
 const c=await f.club('승인 대기','pending-user','PENDING');await f.login(c.username);assert.equal((await get(f)).status,403);
 await f.call('accountSave',{id:c.id,username:c.username,status:'APPROVED'});assert.equal((await get(f)).status,401);await f.login(c.username);assert.equal((await get(f)).status,200);
});
test('dashboard separates photo and inspection totals, excludes voids, and exposes only the logged-in club',async()=>{
 const f=await fixture(),a=await f.club('내 동아리','own-user'),b=await f.club('다른 동아리','other-user');await f.login(a.username);
 photo(f,a.clubId);const voided=photo(f,a.clubId,{points:100,voided:1,content:'취소된 벌점'});await inspection(f,a.clubId,7);
 photo(f,b.clubId,{content:'다른 동아리만 아는 사유'});await inspection(f,b.clubId,90,'다른 동아리 점검');
 const r=await get(f,{clubId:b.clubId});assert.equal(r.status,200);assert.deepEqual(r.body.stats,{photo:{count:1,points:10},inspection:{count:1,points:7}});assert.equal(r.body.totalPoints,17);assert.equal(r.body.penalties.length,2);assert.ok(!r.body.penalties.some(p=>p.id===voided));
 assert.doesNotMatch(JSON.stringify(r.body),/다른 동아리|취소된 벌점|password|phone|session_token/);assert.match(r.headers.get('cache-control'),/no-store/);
});
test('penalty filters and pages preserve full-period totals and cannot inject SQL',async()=>{
 const f=await fixture(),c=await f.club();await f.login(c.username);
 for(let i=0;i<35;i++)photo(f,c.clubId,{date:'2026-01-'+String(i%28+1).padStart(2,'0')});await inspection(f,c.clubId,9);
 const a=await get(f,{kind:'photo'}),b=await get(f,{kind:'photo',page:'1'});assert.equal(a.body.penalties.length,30);assert.equal(a.body.more,true);assert.equal(b.body.penalties.length,5);assert.equal(b.body.more,false);assert.equal(new Set([...a.body.penalties,...b.body.penalties].map(p=>p.id)).size,35);assert.equal(a.body.totalPoints,359);assert.equal(b.body.totalPoints,359);
 const i=await get(f,{kind:'inspection'});assert.equal(i.body.penalties.length,1);assert.equal(i.body.penalties[0].kind,'inspection');assert.equal(i.body.totalPoints,359);
 for(const p of [{page:'-1'},{page:'0.5'},{page:'NaN'},{page:'10001'},{kind:"photo' OR 1=1 --"}])assert.equal((await get(f,p)).status,400);
});
test('dashboard reflects administrator penalty cancellation immediately without deleting history',async()=>{
 const f=await fixture(),c=await f.club();await f.login(c.username);const id=photo(f,c.clubId);assert.equal((await get(f)).body.totalPoints,10);await f.call('voidPenalty',{id});const r=await get(f);assert.equal(r.body.totalPoints,0);assert.deepEqual(r.body.penalties,[]);assert.equal(f.sqlite.prepare('SELECT voided FROM penalties WHERE id=?').get(id).voided,1);
});
test('earliest rental excludes cancelled, deleted, completed and other-club bookings and refreshes after cancellation',async()=>{
 const f=await fixture(),a=await f.club('내 동아리','own-user'),b=await f.club('다른 동아리','other-user');await f.login(a.username);
 await force(f,b.clubId,{date:'2030-01-06'});const cancelled=await force(f,a.clubId,{date:'2030-01-07'});await f.call('bookingAction',{id:cancelled.id,action:'cancel'});
 const deleted=await force(f,a.clubId,{date:'2030-01-08'});assert.equal((await f.call('bookingAction',{id:deleted.id,action:'cancel'})).status,200);assert.equal((await f.call('bookingAction',{id:deleted.id,action:'delete'})).status,200);
 const later=await force(f,a.clubId,{date:'2030-01-10'}),first=await force(f,a.clubId,{date:'2030-01-09'});
 let r=await get(f);assert.equal(r.body.nextBooking.id,first.id);assert.equal(r.body.nextBooking.status,'OVERRIDE');assert.doesNotMatch(JSON.stringify(r.body.nextBooking),/phone|representative|note/);
 await f.call('cancel',{id:first.id},'club');assert.equal((await get(f)).body.nextBooking.id,later.id);await f.call('cancel',{id:later.id},'club');assert.equal((await get(f)).body.nextBooking,null);
});
test('current rental remains visible until its ending minute in Korean time',async t=>{
 const f=await fixture(),c=await f.club();await f.login(c.username);const booking=await force(f,c.clubId);
 f.sqlite.exec('UPDATE club_sessions SET expires=9999999999999');
 t.mock.timers.enable({apis:['Date'],now:Date.UTC(2030,0,7,7)}); // 16:00 KST, A time in progress.
 let r=await get(f);assert.equal(r.body.serverDate,'2030-01-07');assert.equal(r.body.serverMinute,960);assert.equal(r.body.nextBooking.id,booking.id);
 t.mock.timers.setTime(Date.UTC(2030,0,7,8));assert.equal((await get(f)).body.nextBooking,null); // 17:00, finished.
});
test('revoked or suspended login cannot retrieve private penalty data including a revocation during the read',async()=>{
 const f=await fixture(),c=await f.club();await f.login(c.username);photo(f,c.clubId);
 f.beforeBatch(()=>f.sqlite.exec('DELETE FROM club_sessions'));const r=await get(f);assert.equal(r.status,401);assert.equal(r.body.scope,'club');assert.ok(!r.body.stats);
 await f.login(c.username);await f.call('accountSave',{id:c.id,username:c.username,status:'SUSPENDED'});assert.equal((await get(f)).status,401);
});
test('home announcement persists independently and its on/off does not reset reservation notice acknowledgements',async()=>{
 const f=await fixture();const value={...structuredClone(DEFAULT_SITE),homeNoticeEnabled:true,homeNoticeTitle:'10월 동방점검 안내',homeNoticeBody:'첫 줄\n둘째 줄'};
 let r=await f.call('saveSiteContent',{baseVersion:'initial',requestKey:crypto.randomUUID(),settings:value});assert.equal(r.status,200);assert.equal(r.body.noticeVersion,'v8');
 let publicValue=await f.call('siteContent',{},'guest','GET');assert.equal(publicValue.body.settings.homeNoticeEnabled,true);assert.equal(publicValue.body.settings.homeNoticeBody,value.homeNoticeBody);
 r=await f.call('saveSiteContent',{baseVersion:r.body.version,requestKey:crypto.randomUUID(),settings:{...value,homeNoticeEnabled:false}});assert.equal(r.status,200);assert.equal(r.body.settings.homeNoticeEnabled,false);assert.equal(r.body.settings.homeNoticeBody,value.homeNoticeBody);assert.equal(r.body.noticeVersion,'v8');
});
test('legacy settings receive home notice defaults without losing branding or notices',async()=>{
 const f=await fixture(),legacy=structuredClone(DEFAULT_SITE);delete legacy.homeNoticeEnabled;delete legacy.homeNoticeTitle;delete legacy.homeNoticeBody;legacy.brand='기존 이름';
 const r=await f.call('saveSiteContent',{baseVersion:'initial',requestKey:crypto.randomUUID(),settings:legacy});assert.equal(r.status,200);
 // Simulate the precise JSON stored by release 1.2.
 f.sqlite.prepare('UPDATE site_content SET settings=? WHERE id=1').run(JSON.stringify(legacy));const current=await f.call('siteContent',{},'guest','GET');assert.equal(current.body.settings.homeNoticeEnabled,false);assert.equal(current.body.settings.homeNoticeBody,'');assert.equal(current.body.settings.brand,'기존 이름');assert.deepEqual(current.body.settings.notices,legacy.notices);
});
test('home announcement input is bounded, validates on/off, and remains administrator-only',async()=>{
 const f=await fixture();const call=(patch,who='admin')=>f.call('saveSiteContent',{baseVersion:'initial',requestKey:crypto.randomUUID(),settings:{...structuredClone(DEFAULT_SITE),...patch}},who);
 for(const patch of [{homeNoticeEnabled:'true'},{homeNoticeEnabled:true},{homeNoticeTitle:'a'.repeat(101)},{homeNoticeBody:'a'.repeat(4001)},{homeNoticeBody:'bad\u0000text'}])assert.equal((await call(patch)).status,400);
 assert.equal((await call({homeNoticeEnabled:true,homeNoticeTitle:'공지',homeNoticeBody:'내용'},'guest')).status,401);
});
test('portal index migration is repeatable and preserves existing operational data',async()=>{
 const f=await fixture(),c=await f.club();photo(f,c.clubId);await force(f,c.clubId);const tables=['clubs','club_accounts','bookings','penalties'];const before=tables.map(t=>f.sqlite.prepare('SELECT * FROM '+t).all());const migration=readFileSync(new URL('../migrations/0005_club_portal.sql',import.meta.url),'utf8');f.sqlite.exec(migration);f.sqlite.exec(migration);assert.deepEqual(tables.map(t=>f.sqlite.prepare('SELECT * FROM '+t).all()),before);
});
