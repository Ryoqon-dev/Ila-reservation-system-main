import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './account-helpers.mjs';
import {hash} from '../lib/security.mjs';
const get=(f,op,who='first')=>f.call(op,{},who,'GET');
const heartbeat=(f,who)=>f.call('clubHeartbeat',{},who);
async function pair(){const f=await fixture(),c=await f.club();await f.login(c.username,'first');await f.login(c.username,'second');return {f,c};}

test('second login can read club penalties but rental list, booking, cancellation and legacy routes are blocked',async()=>{
 const {f,c}=await pair();
 await f.call('openings',{from:'2030-01-07',to:'2030-01-07',rooms:['심정실'],open:true});
 const booking=await f.call('book',f.book(),'first');assert.equal(booking.status,200);
 assert.equal((await get(f,'myClub','second')).status,200);
 assert.equal((await get(f,'myBookings','second')).status,423);
 for(const [op,p] of [['book',f.book()],['cancel',{id:booking.body.id}],['myReceipt',{id:booking.body.id}],['lookup',{phone:'01012345678',bookingCode:booking.body.bookingCode}]]){
  const r=await f.call(op,p,'second');assert.equal(r.status,423);assert.equal(r.body.error,'장소 대여 메뉴는 한 명만 입장 가능합니다.');assert.equal(r.body.scope,'rental');
 }
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);
 assert.equal((await f.call('cancel',{id:booking.body.id},'first')).status,200);
 assert.equal((await get(f,'clubSession','second')).status,200);
 assert.doesNotMatch(JSON.stringify((await get(f,'clubSession')).body),/login_token|session_token|password_hash|password_cipher|expires/);
});
test('a waiting heartbeat cannot take or extend an active owner lease',async()=>{
 const {f}=await pair();const before=f.sqlite.prepare('SELECT * FROM club_rental_leases').get();
 assert.equal((await heartbeat(f,'second')).body.club.rentalAccess,false);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM club_rental_leases').get(),before);
 assert.equal((await get(f,'clubSession')).body.club.rentalAccess,true);
});
test('owner logout hands rental permission to the earliest remaining active login',async()=>{
 const {f,c}=await pair();await f.login(c.username,'third');await f.call('clubLogout',{},'first');
 // Third polling first cannot skip the second login.
 assert.equal((await heartbeat(f,'third')).body.club.rentalAccess,false);
 assert.equal((await heartbeat(f,'second')).body.club.rentalAccess,true);
 assert.equal((await get(f,'myClub','third')).status,200);
});
test('a disconnected owner expires after three minutes and cannot use a resumed stale rental screen',async t=>{
 const {f}=await pair(),base=Date.now();t.mock.timers.enable({apis:['Date'],now:base});
 t.mock.timers.setTime(base+120000);assert.equal((await heartbeat(f,'second')).body.club.rentalAccess,false);
 t.mock.timers.setTime(base+181000);assert.equal((await heartbeat(f,'second')).body.club.rentalAccess,true);
 assert.equal((await get(f,'myBookings','first')).status,423);
 assert.equal((await heartbeat(f,'first')).body.club.rentalAccess,false);
 assert.equal((await get(f,'myClub','first')).status,200);
});
test('visible owner heartbeat renews its lease while keeping other sessions valid',async t=>{
 const {f}=await pair(),base=Date.now();t.mock.timers.enable({apis:['Date'],now:base});
 t.mock.timers.setTime(base+120000);assert.equal((await heartbeat(f,'first')).body.club.rentalAccess,true);
 t.mock.timers.setTime(base+181000);assert.equal((await heartbeat(f,'second')).body.club.rentalAccess,false);
 assert.equal((await get(f,'myClub','second')).status,200);
});
test('parallel waiting heartbeats after release result in a single owner',async()=>{
 const {f,c}=await pair();await f.login(c.username,'third');await f.call('clubLogout',{},'first');
 await Promise.all([heartbeat(f,'second'),heartbeat(f,'third')]);
 const profiles=await Promise.all(['second','third'].map(w=>get(f,'clubSession',w)));
 assert.equal(profiles.filter(r=>r.body.club.rentalAccess).length,1);assert.equal(profiles[0].body.club.rentalAccess,true);
});
test('rental permission transferred during booking or cancellation prevents the transaction',async()=>{
 const {f}=await pair();await f.call('openings',{from:'2030-01-07',to:'2030-01-07',rooms:['심정실'],open:true});
 f.beforeBatch(()=>f.sqlite.exec('DELETE FROM club_rental_leases'));
 assert.equal((await f.call('book',f.book(),'first')).status,423);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);
 await heartbeat(f,'first');const booking=await f.call('book',f.book(),'first');assert.equal(booking.status,200);
 f.beforeBatch(()=>f.sqlite.exec('DELETE FROM club_rental_leases'));
 assert.equal((await f.call('cancel',{id:booking.body.id},'first')).status,423);assert.equal(f.sqlite.prepare('SELECT status FROM bookings').get().status,'APPROVED');
});
test('credential change revokes every device and its lease; stale heartbeat cannot restore access',async()=>{
 const {f}=await pair();assert.equal((await f.call('clubCredentials',{username:'new-login',currentPassword:'club-test-password'},'second')).status,200);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_sessions').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_rental_leases').get().n,0);
 for(const who of ['first','second'])assert.equal((await heartbeat(f,who)).status,401);
 assert.equal((await f.login('new-login','new')).body.club.rentalAccess,true);
});
test('different clubs have independent rental owners and administrators can still override',async()=>{
 const {f}=await pair(),c=await f.club('다른 동아리','other-club');assert.equal((await f.login(c.username,'other')).body.club.rentalAccess,true);
 assert.equal((await f.call('book',f.book({force:true,clubId:c.clubId,reason:'추가승인'}))).status,200);
 assert.equal((await get(f,'clubSession','first')).body.club.rentalAccess,true);
});
test('heartbeat rejects anonymous and cross-site requests; failed logins never obtain leases',async()=>{
 const {f,c}=await pair();assert.equal((await heartbeat(f,'guest')).status,401);
 for(const headers of [{origin:'https://evil.test'},{'content-type':'text/plain'}])assert.equal((await f.call('clubHeartbeat',{},'first','POST',headers)).status,400);
 assert.equal((await f.login(c.username,'wrong','incorrect-password')).status,401);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_sessions').get().n,2);
});
test('migration retains legacy login, reservations and credentials and is safe to repeat',async()=>{
 const f=await fixture(),c=await f.club();const raw='ab'.repeat(32),token=await hash(raw),expires=Date.now()+600000;
 f.sqlite.prepare('UPDATE club_accounts SET session_token=?,session_expires=? WHERE id=?').run(token,expires,c.id);
 const before=f.sqlite.prepare('SELECT * FROM club_accounts').all();const migration=readFileSync(new URL('../migrations/0007_concurrent_club_sessions.sql',import.meta.url),'utf8');f.sqlite.exec(migration);f.sqlite.exec(migration);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM club_accounts').all(),before);assert.equal(f.sqlite.prepare('SELECT token FROM club_sessions').get().token,token);assert.equal(f.sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');f.jars.set('legacy',new Map([['__Host-ila_club',raw]]));assert.equal((await get(f,'clubSession','legacy')).body.club.rentalAccess,true);assert.equal((await heartbeat(f,'legacy')).status,200);
});

test('repeated login in one browser replaces its own cookie without leaving an abandoned lease',async()=>{
 const f=await fixture(),c=await f.club();await f.login(c.username,'first');
 const old=new Map(f.jars.get('first'));assert.equal((await f.login(c.username,'first')).body.club.rentalAccess,true);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_sessions').get().n,1);f.jars.set('old',old);assert.equal((await get(f,'clubSession','old')).status,401);
});
test('login audit failure rolls back the new session and leaves the original owner intact',async()=>{
 const f=await fixture(),c=await f.club();await f.login(c.username,'first');
 f.sqlite.exec("CREATE TRIGGER fail_login_audit BEFORE INSERT ON audit WHEN NEW.action='CLUB_LOGIN' BEGIN SELECT RAISE(ABORT,'private failure'); END;");
 assert.equal((await f.login(c.username,'second')).status,500);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_sessions').get().n,1);assert.equal((await get(f,'clubSession','first')).body.club.rentalAccess,true);
});
test('handover does not extend an absent waiting session beyond its own last heartbeat',async t=>{
 const {f,c}=await pair();await f.login(c.username,'third');const base=Date.now();t.mock.timers.enable({apis:['Date'],now:base});
 t.mock.timers.setTime(base+120000);await f.call('clubLogout',{},'first');assert.equal((await heartbeat(f,'third')).body.club.rentalAccess,false);
 const lease=f.sqlite.prepare('SELECT expires FROM club_rental_leases').get();assert.ok(lease.expires<=base+180000);
 t.mock.timers.setTime(base+181000);assert.equal((await heartbeat(f,'third')).body.club.rentalAccess,true);
});
