import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './account-helpers.mjs';
import {BOOKING_SORT_OPTIONS,bookingCreatedAt,bookingOrder} from '../lib/booking-order.mjs';

const report=(f,p={},who='club')=>f.call('myClub',p,who,'GET');
const dashboard=(f,p={},who='admin')=>f.call('dashboard',{from:'2020-01-01',to:'2035-12-31',...p},who,'GET');
function seed(f,clubId,patch={}) {
  const row={id:crypto.randomUUID(),date:'2030-01-07',room:'심정실',start:900,end:1020,status:'APPROVED',created_at:'2026-10-01T01:00:00.000Z',...patch};
  f.sqlite.prepare('INSERT INTO bookings(id,request_key,date,room,start,end,club_id,representative,phone,note,status,override,reason,inspection,entry_photo,exit_photo,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,crypto.randomUUID(),row.date,row.room,row.start,row.end,clubId,...f.seedBookingFields,row.status,0,'',0,0,0,row.created_at);
  return row;
}

test('club history returns every non-deleted own-club status in ascending rental date/time across pages',async()=>{
  const f=await fixture(),a=await f.club('내 동아리','own-user'),b=await f.club('다른 동아리','other-user');await f.login(a.username);
  const expected=[];
  for(let i=34;i>=0;i--)expected.push(seed(f,a.clubId,{id:'r-'+String(i).padStart(2,'0'),date:i===0?'2020-01-01':'2030-01-'+String(i%28+1).padStart(2,'0'),start:i%2?900:1020,end:i%2?1020:1140,status:i%3===0?'CANCELLED':i%3===1?'APPROVED':'OVERRIDE'}));
  seed(f,a.clubId,{id:'deleted',status:'DELETED'});seed(f,b.clubId,{id:'other-club'});
  expected.sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start||a.id.localeCompare(b.id));
  const first=await report(f,{clubId:b.clubId}),second=await report(f,{bookingPage:'1'}),empty=await report(f,{bookingPage:'2'});
  assert.equal(first.status,200);assert.equal(first.body.bookings.length,30);assert.equal(first.body.bookingsMore,true);assert.equal(first.body.bookingPage,0);
  assert.equal(second.body.bookings.length,5);assert.equal(second.body.bookingsMore,false);assert.equal(second.body.bookingPage,1);assert.deepEqual(empty.body.bookings,[]);
  assert.deepEqual([...first.body.bookings,...second.body.bookings].map(b=>b.id),expected.map(b=>b.id));
  assert.doesNotMatch(JSON.stringify(first.body.bookings),/phone|representative|note|password|bookingCode|other-club|deleted/);
  assert.match(first.headers.get('cache-control'),/no-store/);
});

test('reservation paging is independent of penalty paging and validates untrusted inputs',async()=>{
  const f=await fixture(),a=await f.club();await f.login(a.username);
  for(let i=0;i<32;i++)seed(f,a.clubId,{id:'page-'+String(i).padStart(2,'0')});
  const r=await report(f,{bookingPage:'1',page:'1',kind:'inspection'});assert.equal(r.body.bookings.length,2);assert.equal(r.body.page,1);assert.equal(r.body.bookingPage,1);assert.equal(r.body.totalPoints,0);
  for(const bookingPage of ['-1','0.5','NaN','Infinity','10001',"0; DROP TABLE bookings --"])assert.equal((await report(f,{bookingPage})).status,400);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM bookings').get().n,32);
});

test('another active login may read club history while cancellation keeps the exclusive rental guard',async()=>{
  const f=await fixture(),a=await f.club();await f.login(a.username,'first');await f.login(a.username,'second');
  const booking=seed(f,a.clubId);
  let r=await report(f,{},'second');assert.equal(r.status,200);assert.equal(r.body.bookings[0].id,booking.id);
  assert.equal((await f.call('cancel',{id:booking.id},'second')).status,423);
  assert.equal((await f.call('cancel',{id:booking.id},'first')).status,200);
  r=await report(f,{},'second');assert.equal(r.body.bookings[0].status,'CANCELLED');assert.equal(r.body.nextBooking,null);
  assert.equal((await report(f,{},'guest')).status,401);assert.equal((await report(f,{},'admin')).status,401);
  f.beforeBatch(()=>f.sqlite.exec('DELETE FROM club_sessions'));r=await report(f,{},'second');assert.equal(r.status,401);assert.ok(!r.body.bookings);
});

test('administrator can order bookings by rental date or application timestamp in either direction',async()=>{
  const f=await fixture(),a=await f.club();
  seed(f,a.clubId,{id:'a',date:'2030-01-10',created_at:'2026-10-01T00:00:00.000Z'});
  seed(f,a.clubId,{id:'b',date:'2030-01-08',start:1020,created_at:'2026-10-03T00:00:00.000Z'});
  seed(f,a.clubId,{id:'c',date:'2030-01-08',created_at:'2026-10-02T00:00:00.000Z',status:'CANCELLED'});
  seed(f,a.clubId,{id:'d',date:'2030-01-08',created_at:'2026-10-02T00:00:00.000Z'});
  seed(f,a.clubId,{id:'deleted',status:'DELETED'});
  const before=f.sqlite.prepare('SELECT * FROM bookings ORDER BY id').all();
  for(const [sort,ids] of Object.entries({'date-asc':['c','d','b','a'],'date-desc':['a','b','c','d'],'created-asc':['a','c','d','b'],'created-desc':['b','c','d','a']})){
    const r=await dashboard(f,{sort});assert.equal(r.status,200);assert.equal(r.body.sort,sort);assert.deepEqual(r.body.bookings.map(b=>b.id),ids);
    assert.equal(r.body.bookings[0].phone,'01012345678');assert.ok(r.body.bookings.every(b=>b.created_at));
  }
  assert.equal((await dashboard(f)).body.sort,'date-asc');assert.deepEqual(f.sqlite.prepare('SELECT * FROM bookings ORDER BY id').all(),before);
});

test('administrator order is validated, authenticated, and applied before the 1,000-row result limit',async()=>{
  const f=await fixture(),a=await f.club();
  f.sqlite.exec('BEGIN');for(let i=0;i<1002;i++)seed(f,a.clubId,{id:'limit-'+String(i).padStart(4,'0'),date:i<1000?'2030-01-10':i===1000?'2030-01-01':'2030-01-31',created_at:i<1000?'2026-10-10T00:00:00.000Z':i===1000?'2026-10-01T00:00:00.000Z':'2026-10-31T00:00:00.000Z'});f.sqlite.exec('COMMIT');
  for(const [sort,id] of [['date-asc','limit-1000'],['date-desc','limit-1001'],['created-asc','limit-1000'],['created-desc','limit-1001']]){
    const r=await dashboard(f,{sort});assert.equal(r.status,200);assert.equal(r.body.truncated,true);assert.equal(r.body.bookings.length,1000);assert.equal(r.body.bookings[0].id,id);
  }
  for(const sort of ['', 'invalid', '__proto__', 'constructor', 'b.date; DROP TABLE bookings --'])assert.equal((await dashboard(f,{sort})).status,400);
  assert.equal((await dashboard(f,{},'guest')).status,401);await f.login(a.username);assert.equal((await dashboard(f,{},'club')).status,401);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM bookings').get().n,1002);
});

test('application timestamps use Korean time including seconds and handle missing legacy values',()=>{
  assert.equal(bookingCreatedAt('2026-10-25T16:02:03.456Z'),'2026-10-26 01:02:03');
  assert.equal(bookingCreatedAt('2026-12-31T15:00:00.000Z'),'2027-01-01 00:00:00');
  for(const value of [undefined,null,'','bad date'])assert.equal(bookingCreatedAt(value),'기록 없음');
  assert.equal(BOOKING_SORT_OPTIONS.length,4);for(const option of BOOKING_SORT_OPTIONS)assert.match(bookingOrder(option.value),/b\.(date|created_at)/);
  assert.throws(()=>bookingOrder('date DROP'),/정렬/);
});
