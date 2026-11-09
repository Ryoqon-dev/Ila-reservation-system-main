import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './account-helpers.mjs';
async function bookingFixture(){const f=await fixture(),club=await f.club();await f.login(club.username);const created=await f.call('book',f.book({clubId:club.clubId,force:true,reason:'사진 상태 검증'}));assert.equal(created.status,200);return {...f,id:created.body.id,club}}
const read=f=>({...f.sqlite.prepare('SELECT * FROM bookings WHERE id=?').get(f.id)});
const photos=(f,sent,who='admin')=>f.rawCall('bookingAction',{id:f.id,action:'photos',sent},who);
test('one request changes both photo flags and preserves every other booking field, receipts and penalties',async()=>{
 const f=await bookingFixture(),before=read(f),receipts=f.sqlite.prepare('SELECT * FROM booking_access').all();
 for(const sent of [true,true,false,false]){assert.equal((await photos(f,sent)).status,200);assert.deepEqual(read(f),{...before,entry_photo:Number(sent),exit_photo:Number(sent)})}
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM booking_access').all(),receipts);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM penalties').get().n,0);
});
test('legacy entry-only and exit-only photo records stay intact on reads and can be completed together',async()=>{
 const f=await bookingFixture();for(const [entry,exit]of [[1,0],[0,1]]){f.sqlite.prepare('UPDATE bookings SET entry_photo=?,exit_photo=? WHERE id=?').run(entry,exit,f.id);
  const dashboard=await f.rawCall('dashboard',{from:'2030-01-07',to:'2030-01-07'},'admin','GET');assert.equal(dashboard.status,200);const row=dashboard.body.bookings.find(row=>row.id===f.id);assert.equal(row.entry_photo,entry);assert.equal(row.exit_photo,exit);assert.equal(read(f).entry_photo,entry);assert.equal(read(f).exit_photo,exit);
  assert.equal((await photos(f,true)).status,200);assert.equal(read(f).entry_photo,1);assert.equal(read(f).exit_photo,1);
 }
});
test('club members and guests cannot change either photo flag and malformed photo states are refused',async()=>{
 const f=await bookingFixture(),before=read(f);for(const who of ['club','guest'])assert.equal((await photos(f,true,who)).status,401);
 for(const sent of [undefined,null,'true','false',1,0,[],{}])assert.equal((await photos(f,sent)).status,400);
 assert.deepEqual(read(f),before);
});
test('cancelled or deleted bookings cannot change photo status',async()=>{
 const f=await bookingFixture();for(const status of ['CANCELLED','DELETED']){f.sqlite.prepare('UPDATE bookings SET status=? WHERE id=?').run(status,f.id);const before=read(f);assert.equal((await photos(f,true)).status,400);assert.deepEqual(read(f),before)}
});
test('cancellation immediately before the photo write returns a conflict without changing photo flags or adding a photo audit',async()=>{
 const f=await bookingFixture(),audits=f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n;
 f.beforeBatch(()=>f.sqlite.prepare("UPDATE bookings SET status='CANCELLED' WHERE id=?").run(f.id));
 assert.equal((await photos(f,true)).status,409);assert.equal(read(f).status,'CANCELLED');assert.equal(read(f).entry_photo,0);assert.equal(read(f).exit_photo,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,audits);
});
test('a failed audit rolls back both photo flags as one transaction',async()=>{
 const f=await bookingFixture(),before=read(f);f.sqlite.exec("CREATE TRIGGER photo_audit_failure BEFORE INSERT ON audit WHEN NEW.action='BOOKING_PHOTOS' BEGIN SELECT RAISE(ABORT,'photo audit failed'); END");
 assert.equal((await photos(f,true)).status,500);assert.deepEqual(read(f),before);
});
test('expired administrators and cross-origin requests cannot alter combined photo status',async()=>{
 const f=await bookingFixture(),before=read(f);assert.equal((await f.rawCall('bookingAction',{id:f.id,action:'photos',sent:true},'admin','POST',{origin:'https://untrusted.test'})).status,400);
 f.sqlite.prepare('UPDATE admin_session_security SET last_activity=?').run(Date.now()-900000);assert.equal((await photos(f,true)).status,401);assert.deepEqual(read(f),before);
});
