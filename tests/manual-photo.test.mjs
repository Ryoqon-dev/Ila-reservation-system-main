import {privacy} from '../lib/privacy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './account-helpers.mjs';
const values=(clubId,patch={})=>({clubId,date:'2026-01-02',content:'심정실 퇴실 사진 미제출',points:10,kind:'photo',...patch});
const save=(f,c,patch={},who='admin')=>f.call('savePenalty',values(c.clubId,patch),who);
const report=f=>f.call('myClub',{},'club','GET');
const pastBooking=async(f,c)=>{const r=await f.call('book',f.book({clubId:c.clubId,force:true,reason:'사진 벌점 테스트'}));assert.equal(r.status,200);f.sqlite.prepare('UPDATE bookings SET date=? WHERE id=?').run('2026-01-02',r.body.id);return r.body.id};

test('manual photo penalties require administrator login, validate kind/points/date and preserve old inspection requests',async()=>{
 const f=await fixture(),c=await f.club();await f.login(c.username);
 for(const who of ['guest','club'])assert.equal((await save(f,c,{},who)).status,401);
 for(const patch of [{kind:'other'},{kind:null},{kind:"photo' OR 1=1 --"},{points:0},{points:1.5},{points:1001},{date:'2030-01-01'},{content:''}])assert.equal((await save(f,c,patch)).status,400);
 const legacy=values(c.clubId);delete legacy.kind;assert.equal((await f.call('savePenalty',legacy)).status,200);assert.equal(f.sqlite.prepare('SELECT kind FROM penalties').get().kind,'inspection');
});
test('manual photo points and reasons appear in own-club totals and category history, never another club',async()=>{
 const f=await fixture(),a=await f.club('내 동아리','own-user'),b=await f.club('다른 동아리','other-user');await f.login(a.username);
 assert.equal((await save(f,a,{points:15})).status,200);await f.call('savePenalty',values(a.clubId,{kind:'inspection',points:7,content:'동방 청소 미흡'}));await save(f,b,{points:30,content:'다른 동아리 사유'});
 const r=await report(f);assert.equal(r.status,200);assert.deepEqual(r.body.stats.photo,{points:15,count:1});assert.deepEqual(r.body.stats.inspection,{points:7,count:1});assert.equal(r.body.totalPoints,22);assert.ok(r.body.penalties.some(p=>p.kind==='photo'&&p.content==='심정실 퇴실 사진 미제출'));assert.doesNotMatch(JSON.stringify(r.body),/다른 동아리/);
});
test('concurrent and repeated manual photo requests charge once per club and date without overwriting the first reason',async()=>{
 const f=await fixture(),c=await f.club();const results=await Promise.all([save(f,c),save(f,c)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await save(f,c,{content:'덮어쓰면 안 됨',points:100})).status,409);
 const row=f.sqlite.prepare('SELECT * FROM penalties').get();assert.equal(row.points,10);assert.equal(await privacy(f.config).open(row.content),'심정실 퇴실 사진 미제출');assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='ADD_PENALTY'").get().n,1);
});
test('booking shortcut and manual entry share the daily key and preserve custom manual points and reasons',async()=>{
 const f=await fixture(),c=await f.club(),id=await pastBooking(f,c);assert.equal((await save(f,c,{points:15,content:'관리자 직접 입력 사유'})).status,200);
 assert.equal((await f.call('bookingAction',{id,action:'penalty'})).status,200);const rows=f.sqlite.prepare('SELECT * FROM penalties').all();assert.equal(rows.length,1);assert.equal(rows[0].points,15);assert.equal(await privacy(f.config).open(rows[0].content),'관리자 직접 입력 사유');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='BOOKING_PENALTY'").get().n,0);
});
test('manual entry refuses a day already charged by the booking shortcut and allows different dates and clubs',async()=>{
 const f=await fixture(),a=await f.club('동아리 A','club-a'),b=await f.club('동아리 B','club-b'),id=await pastBooking(f,a);assert.equal((await f.call('bookingAction',{id,action:'penalty'})).status,200);assert.equal((await save(f,a)).status,409);assert.equal((await save(f,a,{date:'2026-01-03'})).status,200);assert.equal((await save(f,b)).status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM penalties WHERE voided=0').get().n,3);
});
test('a voided daily photo penalty can be re-entered with corrected points and reasons without duplicate charge',async()=>{
 const f=await fixture(),c=await f.club();await f.login(c.username);const first=await save(f,c);await f.call('voidPenalty',{id:first.body.id});assert.equal((await report(f)).body.totalPoints,0);
 const corrected=await save(f,c,{points:7,content:'정정된 사유'});assert.equal(corrected.status,200);assert.equal(corrected.body.id,first.body.id);const r=await report(f);assert.equal(r.body.totalPoints,7);assert.equal(r.body.stats.photo.count,1);assert.equal(r.body.penalties[0].content,'정정된 사유');
});
test('manual photo write and its audit record roll back together, and revoked administrator sessions cannot write',async()=>{
 const f=await fixture(),c=await f.club();f.sqlite.exec("CREATE TRIGGER fail_penalty_audit BEFORE INSERT ON audit WHEN NEW.action='ADD_PENALTY' BEGIN SELECT RAISE(ABORT,'simulated audit failure'); END");assert.ok((await save(f,c)).status>=400);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM penalties').get().n,0);f.sqlite.exec('DROP TRIGGER fail_penalty_audit');
 f.beforeBatch(()=>f.sqlite.exec('DELETE FROM sessions'));assert.equal((await save(f,c)).status,401);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM penalties').get().n,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='ADD_PENALTY'").get().n,0);
});
test('legacy active photo rows without a canonical key also prevent duplicate manual daily charges',async()=>{
 const f=await fixture(),c=await f.club();f.sqlite.prepare("INSERT INTO penalties(id,club_id,date,content,points,kind,source_key,voided,created_at) VALUES (?,?,?,?,10,'photo',NULL,0,?)").run(crypto.randomUUID(),c.clubId,'2026-01-02',f.seedPenaltyText,new Date().toISOString());assert.equal((await save(f,c)).status,409);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM penalties').get().n,1);
});
