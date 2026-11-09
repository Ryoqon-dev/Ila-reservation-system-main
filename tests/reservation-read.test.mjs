import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './account-helpers.mjs';
import {kstDateTime} from '../lib/opening-time.mjs';
import {hash} from '../lib/security.mjs';
import {ROOMS} from '../lib/rules.mjs';
const password='reader-test-password';
const get=(f,op,p={},who='reader')=>f.rawCall(op,p,who,'GET');
const post=(f,op,p={},who='reader')=>f.rawCall(op,p,who);
const range={from:'2030-01-07',to:'2030-01-09'};
async function accessFixture(){
 const f=await fixture(),club=await f.club('조회 대상 동아리','club-read-check');await f.login(club.username);
 const created=await f.call('book',f.book({clubId:club.clubId,force:true,reason:'비공개 추가승인 사유',note:'비공개 전달 메모'}));assert.equal(created.status,200);
 const reader=await f.call('saveReader',{name:'근무 부원',username:'reader-one',password,active:true});assert.equal(reader.status,200);
 assert.equal((await post(f,'readerLogin',{username:'reader-one',password})).status,200);
 const issued=await f.call('createReadLink',{name:'기간제 조회',...range,rooms:['심정실'],expiresAt:kstDateTime(Math.floor((Date.now()+86400000)/1000)*1000),requestKey:crypto.randomUUID()});assert.equal(issued.status,200);
 assert.equal((await post(f,'shareRedeem',{token:issued.body.token},'share')).status,200);
 return {...f,club,booking:created.body,readerId:reader.body.id,link:issued.body};
}
const noPrivate=value=>{const text=JSON.stringify(value);assert.doesNotMatch(text,/phone|representative|note|reason|room_password|studentId|bookingCode|request_key|01012345678|비공개 전달|비공개 추가|테스트 대표|enc:v1/)};
test('additive migration preserves all previous reservations, receipts, readers of old data and penalties',async()=>{
 const f=await fixture(),c=await f.club();await f.call('book',f.book({clubId:c.clubId,force:true,reason:'보존'}));const before=f.sqlite.prepare('SELECT * FROM bookings').all(),accounts=f.sqlite.prepare('SELECT * FROM club_accounts').all(),receipts=f.sqlite.prepare('SELECT * FROM booking_access').all();f.sqlite.exec(readFileSync(new URL('../migrations/0012_reservation_read_access.sql',import.meta.url),'utf8'));assert.deepEqual(f.sqlite.prepare('SELECT * FROM bookings').all(),before);assert.deepEqual(f.sqlite.prepare('SELECT * FROM club_accounts').all(),accounts);assert.deepEqual(f.sqlite.prepare('SELECT * FROM booking_access').all(),receipts);
});
test('sub administrator logs in without MFA, uses isolated secure cookie and receives only minimal reservation data',async()=>{
 const f=await accessFixture(),login=await post(f,'readerLogin',{username:'reader-one',password});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/^__Host-ila_reader=.*HttpOnly; Secure; SameSite=Strict/);assert.equal(login.body.challenge,undefined);
 const result=await get(f,'reservationRead',{source:'reader',...range});assert.equal(result.status,200);assert.equal(result.body.bookings.length,1);noPrivate(result.body);assert.deepEqual(Object.keys(result.body.bookings[0]).sort(),['club','date','end','room','start','status']);
 assert.equal((await get(f,'auth')).body.admin,false);const stored=f.sqlite.prepare('SELECT * FROM reservation_readers').get();assert.notEqual(stored.password_hash,password);assert.ok(!JSON.stringify(stored).includes(password));
});
test('only MFA-authenticated main administrator receives full applicant phone number',async()=>{
 const f=await accessFixture(),main=await get(f,'dashboard',range,'admin');assert.equal(main.status,200);assert.equal(main.body.bookings[0].phone,'01012345678');
 for(const who of ['reader','share','guest','club'])assert.equal((await get(f,'dashboard',range,who)).status,401);
});
const privateGets=['dashboard','clubs','accounts','floorplan','penalties','export','dataOverview','readAccess','mfaStatus','scheduledOpenings','siteAdmin'];
const privatePosts=['saveClub','accountSave','accountDelete','credentials','openings','bookingAction','savePenalty','voidPenalty','saveRoomAssignment','saveMetricsLink','executeDataAction','saveReader','createReadLink','revokeReadLink','scheduleOpenings','cancelOpeningSchedule','mfaRotateStart','mfaRecoveryReset'];
for(const who of ['reader','share'])test(who+' cannot reach any management endpoint or forge main role, method or cookie',async()=>{
 const f=await accessFixture();for(const op of privateGets){const result=await get(f,op,{...range,source:'main',role:'admin',admin:'true'},who);assert.equal(result.status,401,op);noPrivate(result.body)}
 for(const op of privatePosts){const result=await post(f,op,{id:f.booking.id,...range,force:true,role:'admin',admin:true,verified:true,sent:true,action:'photos'},who);assert.equal(result.status,401,op)}
 for(const op of ['reservationRead','reservationTable'])assert.equal((await get(f,op,{source:'main',...range,date:range.from},who)).status,401);
 const value=f.jars.get(who).get(who==='reader'?'__Host-ila_reader':'__Host-ila_share');assert.equal((await f.rawCall('clubs',{},'guest','GET',{cookie:'__Host-ila_admin='+value})).status,401);assert.equal((await post(f,'book',f.book({force:true,clubId:f.club.clubId}),who)).status,401);
});
test('wrong password and unknown account are refused; login guessing is rate limited',async()=>{
 const f=await accessFixture();f.sqlite.exec("DELETE FROM attempts WHERE key LIKE 'reservation-reader-login%'");for(let i=0;i<10;i++)assert.equal((await post(f,'readerLogin',{username:i%2?'reader-one':'unknown',password:'wrong'})).status,401);assert.equal((await post(f,'readerLogin',{username:'reader-one',password})).status,429);
});
test('background queries do not renew reader inactivity; fifteen-minute expiry and eight-hour absolute expiry apply',async()=>{
 const f=await accessFixture();f.sqlite.prepare('UPDATE reservation_reader_sessions SET last_activity=?').run(Date.now()-14*60000);const before=f.sqlite.prepare('SELECT last_activity FROM reservation_reader_sessions').get().last_activity;assert.equal((await get(f,'readAuth',{source:'reader'})).status,200);assert.equal((await get(f,'reservationRead',{source:'reader',...range})).status,200);assert.equal(f.sqlite.prepare('SELECT last_activity FROM reservation_reader_sessions').get().last_activity,before);const renewed=await post(f,'readerActivity');assert.equal(renewed.status,200);assert.ok(renewed.body.idleExpiresAt>Date.now()+899000);f.sqlite.prepare('UPDATE reservation_reader_sessions SET last_activity=?').run(Date.now()-900000);assert.equal((await get(f,'reservationRead',{source:'reader',...range})).status,401);assert.equal((await post(f,'readerActivity')).status,401);
 assert.equal((await post(f,'readerLogin',{username:'reader-one',password})).status,200);f.sqlite.prepare('UPDATE reservation_reader_sessions SET expires=?').run(Date.now()-1);assert.equal((await get(f,'readAuth',{source:'reader'})).status,401);
});
test('account edit and disabling revoke existing sessions, enforce stale versions and require fresh main proof',async()=>{
 const f=await accessFixture(),row=f.sqlite.prepare('SELECT * FROM reservation_readers').get(),payload={id:row.id,version:row.version,username:row.username,name:row.name,password:'changed-reader-password',active:true};assert.equal((await f.rawCall('saveReader',payload)).status,403);assert.equal((await f.call('saveReader',payload)).status,200);assert.equal((await get(f,'readAuth',{source:'reader'})).status,401);assert.equal((await post(f,'readerLogin',{username:row.username,password})).status,401);assert.equal((await post(f,'readerLogin',{username:row.username,password:payload.password})).status,200);
 assert.equal((await f.call('saveReader',payload)).status,400);const updated=f.sqlite.prepare('SELECT * FROM reservation_readers').get();assert.equal((await f.call('saveReader',{...payload,version:updated.version,password:'',active:false})).status,200);assert.equal((await post(f,'readerLogin',{username:row.username,password:payload.password})).status,401);
});
test('revocation at a reader or shared data query prevents any reservation response',async()=>{
 const f=await accessFixture();f.beforeBatch(()=>f.sqlite.exec('UPDATE reservation_readers SET active=0'));assert.equal((await get(f,'reservationRead',{source:'reader',...range})).status,401);f.beforeBatch(()=>f.sqlite.exec('UPDATE reservation_share_links SET revoked=1'));assert.equal((await get(f,'reservationTable',{source:'share',date:range.from},'share')).status,401);
});
test('share token and session are hashed at rest; metadata and audit logs never return the link secret',async()=>{
 const f=await accessFixture(),raw=f.link.token;assert.match(raw,/^[a-f0-9]{64}$/);assert.equal(f.sqlite.prepare('SELECT token_hash FROM reservation_share_links').get().token_hash,await hash(raw));assert.ok(!JSON.stringify(f.sqlite.prepare('SELECT * FROM reservation_share_links').all()).includes(raw));assert.ok(!JSON.stringify(f.sqlite.prepare('SELECT * FROM audit').all()).includes(raw));const meta=await get(f,'readAccess',{},'admin');assert.equal(meta.status,200);assert.ok(!JSON.stringify(meta.body).includes(raw));assert.doesNotMatch(JSON.stringify(meta.body),/password_hash|salt|token_hash/);
});
test('share permissions restrict date and rooms even with altered parameters',async()=>{
 const f=await accessFixture();await f.call('book',f.book({clubId:f.club.clubId,room:'진리실',force:true,reason:'다른 장소'}));
 const allowed=await get(f,'reservationRead',{source:'share',...range,rooms:'진리실'},'share');assert.equal(allowed.status,200);assert.equal(allowed.body.bookings.length,1);assert.equal(allowed.body.bookings[0].room,'심정실');noPrivate(allowed.body);
 for(const p of [{from:'2030-01-06',to:range.to},{from:range.from,to:'2030-01-10'}])assert.equal((await get(f,'reservationRead',{source:'share',...p},'share')).status,403);
 assert.equal((await get(f,'reservationTable',{source:'share',date:'2030-01-10'},'share')).status,403);
});
test('share expires exactly at server deadline and cannot be redeemed again; revoked sessions are denied',async()=>{
 const f=await accessFixture(),deadline=Date.now()+60000;f.sqlite.prepare('UPDATE reservation_share_links SET expires=?').run(deadline);f.sqlite.prepare('UPDATE reservation_share_sessions SET expires=?').run(deadline);const real=Date.now;
 try{Date.now=()=>deadline-1;assert.equal((await get(f,'readAuth',{source:'share'},'share')).status,200);Date.now=()=>deadline;assert.equal((await get(f,'readAuth',{source:'share'},'share')).status,401);assert.equal((await post(f,'shareRedeem',{token:f.link.token},'share')).status,401)}finally{Date.now=real}
 f.sqlite.prepare('UPDATE reservation_share_links SET expires=?').run(Date.now()+60000);f.sqlite.prepare('UPDATE reservation_share_sessions SET expires=?').run(Date.now()+60000);assert.equal((await f.call('revokeReadLink',{id:f.link.id})).status,200);assert.equal((await get(f,'readAuth',{source:'share'},'share')).status,401);
});
test('link creation requires main reauthentication and validates bounded expiry, date range, rooms and request IDs',async()=>{
 const f=await accessFixture(),p={name:'새 링크',...range,rooms:ROOMS,expiresAt:kstDateTime(Date.now()+86400000),requestKey:crypto.randomUUID()};assert.equal((await f.rawCall('createReadLink',p)).status,403);
 for(const patch of [{expiresAt:kstDateTime(Date.now()-1000)},{expiresAt:kstDateTime(Date.now()+366*86400000)},{to:'2030-01-14'},{rooms:[]},{rooms:['다른실']},{requestKey:'x'},{from:'2030-02-30'}])assert.equal((await f.call('createReadLink',{...p,...patch})).status,400);
});
test('maximum 365-day link expiry leaves the allowed reservation range at seven days and existing links intact',async()=>{
 const f=await accessFixture(),day=86400000,real=Date.now,now=Math.floor(real()/1000)*1000,deadline=now+365*day;
 const payload={name:'1년 링크',from:range.from,to:'2030-01-13',rooms:['심정실'],requestKey:crypto.randomUUID()};
 try{
  Date.now=()=>now;
  const tooLong=await f.call('createReadLink',{...payload,expiresAt:kstDateTime(deadline+1000)});assert.equal(tooLong.status,400);assert.match(tooLong.body.error,/365일/);
  const issued=await f.call('createReadLink',{...payload,expiresAt:kstDateTime(deadline)});assert.equal(issued.status,200);assert.equal(issued.body.expires,deadline);
  assert.equal(f.sqlite.prepare('SELECT expires FROM reservation_share_links WHERE id=?').get(f.link.id).expires,f.link.expires);
  const redeemed=await post(f,'shareRedeem',{token:issued.body.token},'share');assert.equal(redeemed.status,200);assert.match(redeemed.headers.get('set-cookie'),/Max-Age=604800$/);
  const allowed=await get(f,'reservationRead',{source:'share',from:payload.from,to:payload.to},'share');assert.equal(allowed.status,200);noPrivate(allowed.body);
  assert.equal((await get(f,'reservationRead',{source:'share',from:payload.from,to:'2030-01-14'},'share')).status,403);
  Date.now=()=>now+7*day;
  assert.equal((await get(f,'readAuth',{source:'share'},'share')).status,401);
  assert.equal((await post(f,'shareRedeem',{token:issued.body.token},'share')).status,200);
  Date.now=()=>deadline-1000;
  assert.match((await post(f,'shareRedeem',{token:issued.body.token},'share')).headers.get('set-cookie'),/Max-Age=1$/);
  Date.now=()=>deadline;
  assert.equal((await get(f,'readAuth',{source:'share'},'share')).status,401);
  assert.equal((await post(f,'shareRedeem',{token:issued.body.token},'share')).status,401);
 }finally{Date.now=real}
});
test('link/account mutations are guarded at DB write time and roll back on audit failure',async()=>{
 const f=await accessFixture(),before=f.sqlite.prepare('SELECT COUNT(*) AS n FROM reservation_share_links').get().n;const original=f.db.batch.bind(f.db);let armed=true;f.db.batch=async items=>{if(armed&&items.some(i=>i.query.includes('INSERT INTO reservation_share_links'))){armed=false;f.sqlite.exec('DELETE FROM sessions')}return original(items)};
 const result=await f.call('createReadLink',{name:'차단',...range,rooms:['심정실'],expiresAt:kstDateTime(Date.now()+86400000),requestKey:crypto.randomUUID()});assert.equal(result.status,401);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM reservation_share_links').get().n,before);
});
test('CSRF, unsupported methods, malformed input and role flags cannot grant restricted access',async()=>{
 const f=await accessFixture();assert.equal((await f.rawCall('shareRedeem',{token:f.link.token},'guest','POST',{origin:'https://other.test'})).status,400);for(const token of ['x',{},null,'f'.repeat(64)])assert.ok((await post(f,'shareRedeem',{token},'guest')).status>=400);
 for(const source of ['admin','owner','',undefined])assert.equal((await get(f,'reservationRead',{source,role:'admin',...range},'guest')).status,400);
 for(const page of ['-1','0.5','10001','abc'])assert.equal((await get(f,'reservationRead',{source:'reader',...range,page})).status,400);
 assert.equal((await get(f,'reservationRead',{source:'reader',...range,sort:'b.phone;DROP TABLE bookings'})).status,400);
});
test('daily timetable independently returns all active day bookings, excludes cancellation/deletion and discloses no private fields',async()=>{
 const f=await accessFixture();await f.call('book',f.book({clubId:f.club.clubId,room:'진리실',slotIds:['B'],force:true,reason:'검증'}));await f.call('bookingAction',{id:f.booking.id,action:'cancel'});
 const table=await get(f,'reservationTable',{source:'main',date:range.from},'admin');assert.equal(table.status,200);assert.equal(table.body.bookings.length,1);assert.equal(table.body.bookings[0].room,'진리실');noPrivate(table.body);
 const list=await get(f,'reservationRead',{source:'reader',...range});assert.equal(list.body.bookings.length,2);
});
test('reader logout and shared-view exit invalidate only their own session, without elevating or deleting main access',async()=>{
 const f=await accessFixture();assert.equal((await post(f,'readerLogout')).status,200);assert.equal((await get(f,'readAuth',{source:'reader'})).status,401);assert.equal((await post(f,'shareLogout',{},'share')).status,200);assert.equal((await get(f,'readAuth',{source:'share'},'share')).status,401);assert.equal((await get(f,'auth',{},'admin')).body.admin,true);
});

test('switching from a main browser session to a reader login revokes that browser main privilege',async()=>{
 const f=await accessFixture(),jar=f.jars.get('reader');jar.set('__Host-ila_admin',f.jars.get('admin').get('__Host-ila_admin'));assert.equal((await post(f,'readerLogin',{username:'reader-one',password})).status,200);assert.equal((await get(f,'auth')).body.admin,false);assert.equal((await get(f,'clubs')).status,401);assert.equal((await get(f,'reservationRead',{source:'reader',...range})).status,200);
});
test('reader account and link creation both roll back if their audit write fails',async()=>{
 const f=await accessFixture(),readers=f.sqlite.prepare('SELECT COUNT(*) AS n FROM reservation_readers').get().n,links=f.sqlite.prepare('SELECT COUNT(*) AS n FROM reservation_share_links').get().n;f.sqlite.exec("CREATE TRIGGER refuse_access_audit BEFORE INSERT ON audit WHEN NEW.action IN ('SAVE_READER','CREATE_READ_LINK') BEGIN SELECT RAISE(ABORT,'access audit failed'); END");
 assert.equal((await f.call('saveReader',{name:'거부',username:'refused-reader',password,active:true})).status,500);assert.equal((await f.call('createReadLink',{name:'거부',...range,rooms:['심정실'],expiresAt:kstDateTime(Date.now()+86400000),requestKey:crypto.randomUUID()})).status,500);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM reservation_readers').get().n,readers);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM reservation_share_links').get().n,links);
});
test('concurrent reader edits cannot replace the winning account version or leave old sessions valid',async()=>{
 const f=await accessFixture(),row=f.sqlite.prepare('SELECT * FROM reservation_readers').get();let raced=false;const original=f.db.batch.bind(f.db);f.db.batch=async items=>{if(!raced&&items.some(item=>item.query.startsWith('UPDATE reservation_readers'))){raced=true;f.sqlite.prepare('UPDATE reservation_readers SET name=?,version=version+1 WHERE id=?').run('다른 관리자 저장',row.id)}return original(items)};
 const response=await f.call('saveReader',{id:row.id,version:row.version,name:'지연된 수정',username:row.username,active:true,password:''});assert.equal(response.status,409);assert.equal(f.sqlite.prepare('SELECT name FROM reservation_readers').get().name,'다른 관리자 저장');assert.equal((await get(f,'readAuth',{source:'reader'})).status,401);
});

test('malformed account identifiers and state cannot accidentally create or edit an account',async()=>{
 const f=await accessFixture(),before=f.sqlite.prepare('SELECT COUNT(*) AS n FROM reservation_readers').get().n;for(const id of [null,'',false,0,[],{},'not-an-id'])assert.equal((await f.call('saveReader',{id,name:'입력 검증',username:'bad-input-reader',password,active:true})).status,400);assert.equal((await f.call('saveReader',{name:'입력 검증',username:'bad-input-reader',password,active:'true'})).status,400);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM reservation_readers').get().n,before);
});
