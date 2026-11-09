import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './account-helpers.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const get=(f,op,p={},who='club')=>f.call(op,p,who,'GET');

test('registration creates only a pending account; pending session cannot book, look up, cancel or fetch receipts',async()=>{
 const f=await fixture();const c=await f.call('saveClub',{name:'가입 동아리',room:'201'});
 const r=await f.call('clubSignup',{clubId:c.body.id,username:'new-club',password:'new-test-password',status:'APPROVED'},'guest');
 assert.equal(r.status,201);assert.equal(r.body.status,'PENDING');assert.equal(f.sqlite.prepare('SELECT status FROM club_accounts').get().status,'PENDING');
 const login=await f.login('new-club','club','new-test-password');assert.equal(login.status,200);assert.equal(login.body.club.status,'PENDING');
 for(const op of ['book','lookup','cancel','myReceipt'])assert.equal((await f.call(op,f.book(), 'club')).status,403);
 assert.equal((await get(f,'myBookings')).status,403);
 assert.equal((await f.call('accountSave',{id:r.body.id,status:'APPROVED'},'club')).status,401);
 const text=JSON.stringify((await get(f,'clubSession')).body);assert.doesNotMatch(text,/password|salt|session_token|cipher/);
});
test('one representative account per club and case-insensitive usernames are enforced, including concurrent signups',async()=>{
 const f=await fixture();const c=(await f.call('saveClub',{name:'가입1',room:'1'})).body.id;
 const payload={clubId:c,username:'Shared-ID',password:'new-test-password'};
 const results=await Promise.all([f.call('clubSignup',payload,'one'),f.call('clubSignup',{...payload,username:'another-id'},'two')]);
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_accounts').get().n,1);
 const c2=(await f.call('saveClub',{name:'가입2',room:'2'})).body.id;
 const username=f.sqlite.prepare('SELECT username FROM club_accounts').get().username.toUpperCase();
 assert.equal((await f.call('clubSignup',{clubId:c2,username,password:'new-test-password'},'three')).status,409);
 assert.equal((await f.call('accountSave',{clubId:c,username:'admin-duplicate',password:'new-test-password'})).status,409);
});
test('administrator approval invalidates a pending session and enables the next login',async()=>{
 const f=await fixture();const c=await f.club('승인 동아리','pending-user','PENDING');await f.login(c.username);
 assert.equal((await f.call('accountSave',{id:c.id,username:c.username,status:'APPROVED'})).status,200);
 assert.equal((await get(f,'clubSession')).status,401);assert.equal((await f.login(c.username)).body.club.status,'APPROVED');
 await f.call('openings',{from:'2030-01-07',to:'2030-01-07',rooms:['심정실'],open:true});assert.equal((await f.call('book',f.book(),'club')).status,200);
});
test('concurrent club logins stay valid and stale logout revokes only that browser',async()=>{
 const f=await fixture();const c=await f.club();await f.login(c.username,'browser1');const firstCookie=new Map(f.jars.get('browser1'));await f.login(c.username,'browser2');
 assert.equal((await get(f,'clubSession',{},'browser1')).status,200);assert.equal((await get(f,'clubSession',{},'browser2')).status,200);
 assert.equal((await get(f,'clubSession',{},'browser1')).body.club.rentalAccess,true);assert.equal((await get(f,'clubSession',{},'browser2')).body.club.rentalAccess,false);
 f.jars.set('stale',firstCookie);await f.call('clubLogout',{},'stale');assert.equal((await get(f,'clubSession',{},'browser2')).status,200);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_sessions').get().n,1);
});
test('simultaneous logins keep all sessions with exactly one rental owner',async()=>{
 const f=await fixture();const c=await f.club();const r=await Promise.all([f.login(c.username,'one'),f.login(c.username,'two'),f.login(c.username,'three')]);assert.ok(r.every(x=>x.status===200));
 const checks=await Promise.all(['one','two','three'].map(w=>get(f,'clubSession',{},w)));assert.equal(checks.filter(x=>x.status===200).length,3);assert.equal(checks.filter(x=>x.body.club.rentalAccess).length,1);
});
test('cookies are secure and expired, forged or logged-out sessions cannot perform club actions',async()=>{
 const f=await fixture();const c=await f.club();const r=await f.login(c.username);assert.match(r.headers.get('set-cookie'),/^__Host-ila_club=.*HttpOnly; Secure; SameSite=Strict; Path=\//);
 assert.equal((await f.call('book',f.book(),'guest')).status,401);
 assert.equal((await get(f,'myBookings',{},'guest')).status,401);
 assert.equal((await f.call('myReceipt',{id:'fake'},'guest','POST',{cookie:'__Host-ila_club='+'a'.repeat(64)})).status,401);
 f.sqlite.exec('UPDATE club_sessions SET expires=0');assert.equal((await get(f,'myBookings')).status,401);
 await f.login(c.username);await f.call('clubLogout',{},'club');assert.equal((await get(f,'myBookings')).status,401);
});
test('server supplies club identity and prevents another club booking, lookup, cancellation and receipt access',async()=>{
 const f=await fixture();const a=await f.club('동아리 A','user-a'),b=await f.club('동아리 B','user-b');await f.login(a.username,'a');await f.login(b.username,'b');
 await f.call('openings',{from:'2030-01-07',to:'2030-01-07',rooms:['심정실'],open:true});
 assert.equal((await f.call('book',f.book({clubId:b.clubId}),'a')).status,403);
 const booking=await f.call('book',f.book(),'a');assert.equal(booking.status,200);assert.equal(f.sqlite.prepare('SELECT club_id FROM bookings').get().club_id,a.clubId);
 assert.equal((await get(f,'myBookings',{},'a')).body.bookings.length,1);assert.equal((await get(f,'myBookings',{},'b')).body.bookings.length,0);
 assert.equal((await f.call('cancel',{id:booking.body.id},'b')).status,400);
 assert.equal((await f.call('myReceipt',{id:booking.body.id},'b')).status,400);
 assert.equal((await f.call('lookup',{phone:'01012345678',bookingCode:booking.body.bookingCode},'b')).body.bookings.length,0);
 assert.equal((await f.call('cancel',{id:booking.body.id,phone:'01012345678',bookingCode:booking.body.bookingCode},'guest')).status,401);
 assert.equal((await f.call('book',f.book({force:true,reason:'위조',clubId:a.clubId}),'a')).status,401);
 assert.equal((await f.call('cancel',{id:booking.body.id},'a')).status,200);
});
test('existing bookings and receipt codes remain valid after account creation and rename',async()=>{
 const f=await fixture();const c=await f.club();const legacy=await f.call('book',f.book({clubId:c.clubId,force:true,reason:'기존 예약'}));await f.login(c.username);
 assert.equal((await get(f,'myBookings')).body.bookings[0].id,legacy.body.id);
 const code=(await f.call('myReceipt',{id:legacy.body.id},'club')).body.bookingCode;assert.equal(code,legacy.body.bookingCode);
 await f.call('saveClub',{id:c.clubId,name:'변경된 동아리명',room:'501'});
 assert.equal((await get(f,'clubSession')).body.club.club,'변경된 동아리명');
 assert.equal((await f.call('lookup',{phone:'01012345678',bookingCode:code},'club')).body.bookings[0].club,'변경된 동아리명');
});
test('self-service username/password changes require the current password, preserve approval and revoke old login',async()=>{
 const f=await fixture();const c=await f.club();await f.login(c.username);
 assert.equal((await f.call('clubCredentials',{username:'new-user',password:'new-password-123',currentPassword:'wrong'},'club')).status,403);
 assert.equal((await f.call('clubCredentials',{username:'new-user',password:'new-password-123',currentPassword:'club-test-password'},'club')).status,200);
 assert.equal((await get(f,'myBookings')).status,401);assert.equal((await f.login(c.username)).status,401);
 const result=await f.login('new-user','club','new-password-123');assert.equal(result.status,200);assert.equal(result.body.club.status,'APPROVED');
 assert.equal((await f.call('clubCredentials',{username:'only-name',currentPassword:'new-password-123'},'club')).status,200);assert.equal((await f.login('only-name','club','new-password-123')).status,200);
});
test('club passwords are hash-only and original-password retrieval is permanently unavailable',async()=>{
 const f=await fixture();const c=await f.club();const row=f.sqlite.prepare('SELECT * FROM club_accounts').get();assert.notEqual(row.password_hash,'club-test-password');assert.notEqual(row.password_cipher,'club-test-password');assert.equal(row.password_cipher,'');
 const dbText=JSON.stringify(row);assert.ok(!dbText.includes('club-test-password'));
 for(const [op,who] of [['registrationClubs','guest'],['day','guest'],['clubs','admin']]){const r=await get(f,op,{date:'2030-01-07'},who);const text=JSON.stringify(r.body);assert.doesNotMatch(text,/password_hash|password_cipher|session_token|club-test-password|4321/)}
 assert.equal((await f.call('accountSecret',{id:c.id,adminPassword:'admin-test-password'},'guest')).status,401);
 assert.equal((await f.call('accountSecret',{id:c.id,adminPassword:'wrong'})).status,410);
 assert.equal((await f.call('accountSecret',{id:c.id,adminPassword:'admin-test-password'})).status,410);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='VIEW_ACCOUNT_PASSWORD'").get().n,0);
});
test('administrator reset/suspension/deletion terminate sessions and preserve reservations/penalties',async()=>{
 const f=await fixture();const c=await f.club();await f.login(c.username);const booking=await f.call('book',f.book({clubId:c.clubId,force:true,reason:'검증'}));
 await f.call('savePenalty',{clubId:c.clubId,date:'2026-01-01',content:'기존 벌점',points:10});
 assert.equal((await f.call('accountSave',{id:c.id,username:'reset-user',password:'reset-password-123'})).status,200);assert.equal((await get(f,'myBookings')).status,401);
 assert.equal((await f.login('reset-user','club','reset-password-123')).status,200);
 await f.call('accountSave',{id:c.id,username:'reset-user',status:'SUSPENDED'});assert.equal((await get(f,'myBookings')).status,401);assert.equal((await f.login('reset-user','club','reset-password-123')).status,401);
 assert.equal((await f.call('accountDelete',{id:c.id})).status,200);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM penalties').get().n,1);
 const next=await f.call('accountSave',{clubId:c.clubId,username:'next-rep',password:'next-rep-password'});assert.equal(next.status,200);await f.login('next-rep','club','next-rep-password');assert.equal((await get(f,'myBookings')).body.bookings[0].id,booking.body.id);
});
test('club deactivation invalidates sessions and later reactivation does not restore old cookies',async()=>{
 const f=await fixture();const c=await f.club();await f.login(c.username);
 await f.call('saveClub',{id:c.clubId,name:'동아리',room:'301',active:false});assert.equal((await get(f,'myBookings')).status,401);
 await f.call('saveClub',{id:c.clubId,name:'동아리',room:'301',active:true});assert.equal((await get(f,'myBookings')).status,401);assert.equal((await f.login(c.username)).status,200);
});
test('account writes reject cross-origin, CSRF-style content types, weak passwords and invalid identifiers',async()=>{
 const f=await fixture();const c=(await f.call('saveClub',{name:'보호',room:'301'})).body.id;
 const payload={clubId:c,username:'safe-id',password:'safe-password-123'};
 for(const headers of [{origin:'https://evil.test'},{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'}])assert.equal((await f.call('clubSignup',payload,'guest','POST',headers)).status,400);
 for(const p of [{...payload,password:'short'},{...payload,username:'관리자'},{...payload,clubId:'missing'},{...payload,username:"x' OR 1=1 --"}])assert.equal((await f.call('clubSignup',p,'guest')).status,400);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_accounts').get().n,0);
});
test('login failure limit is per account so school shared IP does not lock all clubs',async()=>{
 const f=await fixture();const a=await f.club('동아리A','user-a'),b=await f.club('동아리B','user-b');
 for(let i=0;i<10;i++)await f.login(a.username,'a','incorrect-password');assert.equal((await f.login(a.username,'a','incorrect-password')).status,429);assert.equal((await f.login(b.username,'b')).status,200);
});
test('session revocation immediately before booking transaction prevents the write',async()=>{
 const f=await fixture();const c=await f.club();await f.login(c.username);await f.call('openings',{from:'2030-01-07',to:'2030-01-07',rooms:['심정실'],open:true});
 f.beforeBatch(()=>f.sqlite.exec('DELETE FROM club_sessions'));
 assert.equal((await f.call('book',f.book(),'club')).status,401);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);
});
test('session revocation immediately before cancellation prevents the write',async()=>{
 const f=await fixture();const c=await f.club();await f.login(c.username);const booking=await f.call('book',f.book({clubId:c.clubId,force:true,reason:'검증'}));
 f.beforeBatch(()=>f.sqlite.exec('DELETE FROM club_sessions'));
 assert.equal((await f.call('cancel',{id:booking.body.id},'club')).status,401);assert.equal(f.sqlite.prepare('SELECT status FROM bookings').get().status,'OVERRIDE');
});
test('a reset during login cannot restore the pre-reset password or session',async()=>{
 const f=await fixture();const c=await f.club();f.beforeBatch(()=>f.sqlite.exec('UPDATE club_accounts SET version=version+1,session_token=NULL,session_expires=0'));
 assert.equal((await f.login(c.username)).status,409);assert.equal(f.sqlite.prepare('SELECT session_token FROM club_accounts').get().session_token,null);
});
test('audit failure rolls back registration and password changes, without exposing SQLite errors',async()=>{
 const f=await fixture();const c=(await f.call('saveClub',{name:'가입 실패',room:'1'})).body.id;
 f.sqlite.exec("CREATE TRIGGER fail_account_audit BEFORE INSERT ON audit WHEN NEW.action='CLUB_SIGNUP' BEGIN SELECT RAISE(ABORT,'private database detail'); END;");
 const failed=await f.call('clubSignup',{clubId:c,username:'new-user',password:'new-test-password'},'guest');assert.equal(failed.status,500);assert.doesNotMatch(failed.body.error,/SQLite|private database detail|constraint|salt/i);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_accounts').get().n,0);
 const a=await f.club('변경 실패','real-user');await f.login(a.username);
 f.sqlite.exec("CREATE TRIGGER fail_change_audit BEFORE INSERT ON audit WHEN NEW.action='CLUB_CHANGE_CREDENTIALS' BEGIN SELECT RAISE(ABORT,'private database detail'); END;");
 assert.equal((await f.call('clubCredentials',{username:'after-user',password:'after-test-password',currentPassword:'club-test-password'},'club')).status,500);assert.equal((await f.login(a.username)).status,200);
});
test('more than fifty representative accounts can coexist and log in independently',async()=>{
 const f=await fixture();for(let i=0;i<60;i++)await f.club('동아리 '+i,'club-'+String(i).padStart(3,'0'));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_accounts').get().n,60);
 const users=['club-000','club-025','club-059'];for(const name of users){assert.equal((await f.login(name,name)).status,200);assert.equal((await get(f,'clubSession',{},name)).body.club.username,name)}
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_sessions').get().n,3);
});
test('additive migration preserves existing clubs, bookings, receipt access, passwords and administrator records',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const name of ['0001_initial.sql','0002_booking_access.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.exec("INSERT INTO admins VALUES(1,'existing-admin','original-hash','original-salt'); INSERT INTO clubs VALUES('old-club','기존 동아리','기존동아리','301','encrypted-value',1,'2026-01-01'); INSERT INTO bookings VALUES('old-booking','original-request','2030-01-07','심정실',900,1020,'old-club','대표','01012345678','','APPROVED',0,'',0,0,0,'2026-01-01'); INSERT INTO booking_access VALUES('old-booking','original-code-hash'); INSERT INTO penalties(id,club_id,date,content,points,kind,source_key,voided,created_at) VALUES('old-penalty','old-club','2026-01-01','벌점',10,'inspection',NULL,0,'2026-01-01');");
 const tables=['admins','clubs','bookings','booking_access','penalties'];const before=tables.map(t=>db.prepare('SELECT * FROM '+t).all());const migration=readFileSync(new URL('../migrations/0003_club_accounts.sql',import.meta.url),'utf8');db.exec(migration);db.exec(migration);
 assert.deepEqual(tables.map(t=>db.prepare('SELECT * FROM '+t).all()),before);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('SELECT COUNT(*) n FROM club_accounts').get().n,0);
});
test('administrator session revocation at account write prevents creation',async()=>{
 const f=await fixture();const clubId=(await f.call('saveClub',{name:'관리자 경합',room:'301'})).body.id;f.beforeBatch(()=>f.sqlite.exec('DELETE FROM sessions'));
 assert.equal((await f.call('accountSave',{clubId,username:'guarded-user',password:'guarded-password'})).status,401);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_accounts').get().n,0);
});
test('duplicate username change is rolled back without changing or invalidating the original account',async()=>{
 const f=await fixture();const a=await f.club('동아리1','original-user');await f.club('동아리2','taken-user');await f.login(a.username);
 assert.equal((await f.call('clubCredentials',{username:'taken-user',currentPassword:'club-test-password',password:'replacement-password'},'club')).status,409);assert.equal((await get(f,'clubSession')).body.club.username,'original-user');assert.equal((await f.login(a.username)).status,200);
});
test('administrator cannot silently transfer an account to another club',async()=>{
 const f=await fixture();const a=await f.club('동아리1','original-user');const b=await f.club('동아리2','other-user');assert.equal((await f.call('accountSave',{id:a.id,clubId:b.clubId,username:a.username})).status,400);assert.equal(f.sqlite.prepare('SELECT club_id FROM club_accounts WHERE id=?').get(a.id).club_id,a.clubId);
});
