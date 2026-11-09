import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './account-helpers.mjs';
import {DEFAULT_SITE} from '../lib/site-defaults.mjs';
import {RENTAL_VIEWS,viewFromQuery,rentalNotice} from '../lib/navigation.mjs';
import {FLOORS} from '../lib/floorplan-defaults.mjs';
const catalog=(f,section='guide',admin=false,who='admin')=>f.call('catalog',{section,...(admin?{admin:'true'}:{})},who,'GET');
const entry=(patch={})=>({id:crypto.randomUUID(),requestKey:crypto.randomUUID(),baseVersion:'initial',section:'guide',title:'심정실',body:'거울이 있는 연습실.',visible:true,...patch});
const getMap=f=>f.call('floorplan',{},'admin','GET');
const flat=body=>body.floors.flatMap(f=>[...f.spaces,...f.knownRooms]);
const roomPayload=(map,room,patch={})=>({spaceId:room.id,baseVersion:map.body.version,code:room.code,label:room.label,clubIds:room.clubIds,...patch});
test('public catalog is a safe whitelist; anonymous and club sessions cannot edit entries or view hidden entries',async()=>{
 const f=await fixture();assert.deepEqual((await catalog(f)).body.entries,[]);const p=entry();
 assert.equal((await f.call('saveCatalogEntry',p,'guest')).status,401);assert.equal((await f.call('saveCatalogEntry',p)).status,200);
 let r=await catalog(f,'guide',false,'guest');assert.equal(r.body.entries[0].title,p.title);assert.doesNotMatch(JSON.stringify(r.body),/payload_hash|\bdata\b|password|contacts/);
 assert.equal((await catalog(f,'guide',true,'guest')).status,401);
 await f.call('saveCatalogEntry',{...p,baseVersion:p.requestKey,requestKey:crypto.randomUUID(),visible:false});assert.equal((await catalog(f,'guide',false,'guest')).body.entries.length,0);assert.equal((await catalog(f,'guide',true)).body.entries.length,1);
 const c=await f.club();await f.login(c.username);assert.equal((await f.call('saveCatalogEntry',entry(),'club')).status,401);
});
test('catalog creation retry is idempotent; stale edits and identical-key payload changes are rejected',async()=>{
 const f=await fixture(),p=entry();assert.equal((await f.call('saveCatalogEntry',p)).status,200);assert.equal((await f.call('saveCatalogEntry',p)).status,200);assert.equal((await catalog(f)).body.entries.length,1);
 assert.equal((await f.call('saveCatalogEntry',{...p,title:'다른 내용'})).status,400);assert.equal((await f.call('saveCatalogEntry',{...p,requestKey:crypto.randomUUID()})).status,409);
});
test('catalog sections, ordering and deletion remain independent',async()=>{
 const f=await fixture(),a=entry({title:'첫째'}),b=entry({title:'둘째'}),gear=entry({section:'equipment',title:'마이크'});
 for(const p of [a,b,gear])assert.equal((await f.call('saveCatalogEntry',p)).status,200);
 assert.equal((await f.call('moveCatalogEntry',{id:b.id,baseVersion:b.requestKey,delta:-1})).status,200);let rows=(await catalog(f,'guide',true)).body.entries;assert.deepEqual(rows.map(r=>r.title),['둘째','첫째']);
 assert.equal((await f.call('deleteCatalogEntry',{id:rows[0].id,baseVersion:rows[0].version})).status,200);assert.equal((await catalog(f)).body.entries.length,1);assert.equal((await catalog(f,'equipment')).body.entries.length,1);
});
test('catalog image upload, replacement, hiding and deletion never expose obsolete or hidden image bytes',async()=>{
 const f=await fixture(),file={mime:'image/png',base64:readFileSync(new URL('../public/assets/logo.png',import.meta.url)).toString('base64')},p=entry({image:file});
 const saved=await f.call('saveCatalogEntry',p);assert.equal(saved.status,200,JSON.stringify(saved.body));const image=new URL('https://unit.test'+saved.body.entry.image),params=Object.fromEntries(image.searchParams);delete params.op;
 assert.equal((await f.call('entryImage',params,'guest','GET')).status,200);
 await f.call('saveCatalogEntry',{...p,baseVersion:p.requestKey,requestKey:crypto.randomUUID(),visible:false});assert.equal((await f.call('entryImage',params,'guest','GET')).status,401);
 const row=(await catalog(f,'guide',true)).body.entries[0];assert.equal((await f.call('saveCatalogEntry',{...p,baseVersion:row.version,requestKey:crypto.randomUUID(),image:null})).status,200);assert.equal((await f.call('entryImage',params,'guest','GET')).status,404);
});
test('invalid catalog sections, injected text lengths, unsupported images and cross-origin writes are rejected',async()=>{
 const f=await fixture();for(const patch of [{section:'clubs'},{title:''},{body:'x'.repeat(4001)},{visible:'true'},{image:{mime:'image/svg+xml',base64:'abc'}},{image:{mime:'image/png',base64:'AAAA'}}])assert.equal((await f.call('saveCatalogEntry',entry(patch))).status,400);
 assert.equal((await f.call('saveCatalogEntry',entry(),'admin','POST',{origin:'https://evil.test'})).status,400);
});
test('catalog audit failure and revoked administrator session roll back all entry changes',async()=>{
 const f=await fixture();f.sqlite.exec("CREATE TRIGGER fail_catalog BEFORE INSERT ON audit WHEN NEW.action='SAVE_CONTENT_ENTRY' BEGIN SELECT RAISE(ABORT,'sensitive failure'); END");assert.equal((await f.call('saveCatalogEntry',entry())).status,500);assert.equal((await catalog(f)).body.entries.length,0);
 f.sqlite.exec('DROP TRIGGER fail_catalog');f.beforeBatch(()=>f.sqlite.exec('DELETE FROM sessions'));assert.equal((await f.call('saveCatalogEntry',entry())).status,401);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM content_entries').get().n,0);
});
test('new officer contacts are administrator-only and omitted from public, club and CSV responses',async()=>{
 const f=await fixture(),c=await f.club(),contacts={president:{name:'테스트 회장',phone:'010-1234-5678'},vicePresident:{name:'테스트 부회장',phone:'01022223333'},treasurer:{name:'테스트 총무',phone:'01033334444'}};
 assert.equal((await f.call('saveClub',{id:c.clubId,name:'동아리',room:'301',contacts})).status,200);const rows=(await f.call('clubs',{},'admin','GET')).body.clubs;assert.equal(rows[0].contacts.president.phone,'01012345678');
 await f.login(c.username);for(const [op,p,who,method] of [['myClub',{},'club','GET'],['registrationClubs',{},'guest','GET'],['day',{date:'2030-01-07'},'guest','GET'],['dataExport',{kind:'clubs',from:'2020-01-01',to:'2035-01-01'},'admin','POST']])assert.doesNotMatch(JSON.stringify((await f.call(op,p,who,method)).body),/테스트 회장|01022223333|01033334444/);
 await f.call('saveClub',{id:c.clubId,name:'이름 변경',room:'301',active:false});assert.equal((await f.call('clubs',{},'admin','GET')).body.clubs[0].contacts.president.name,'테스트 회장');
});
test('invalid officer contacts fail before mutation, and audit failure keeps original contacts intact',async()=>{
 const f=await fixture(),c=await f.club();for(const contacts of [{president:{name:'x',phone:'email@example.test'}},{president:{name:'x'.repeat(41),phone:''}},{president:{name:'x',phone:'12'}},{unknown:{name:'x',phone:''}}])assert.equal((await f.call('saveClub',{id:c.clubId,name:'변경',room:'301',contacts})).status,400);
 f.sqlite.exec("CREATE TRIGGER fail_club BEFORE INSERT ON audit WHEN NEW.action='SAVE_CLUB' BEGIN SELECT RAISE(ABORT,'test rollback'); END");assert.equal((await f.call('saveClub',{id:c.clubId,name:'변경',room:'301',contacts:{president:{name:'회장',phone:'01012345678'}}})).status,500);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_contacts').get().n,0);
});
test('floorplan is administrator-only, combines 3F and containers, and identifies missing 2F geometry',async()=>{
 const f=await fixture();assert.equal((await f.call('floorplan',{},'guest','GET')).status,401);const map=await getMap(f);assert.equal(map.status,200);assert.equal(map.body.floors.length,3);const floor=map.body.floors.find(f=>f.id==='hall-3f');assert.ok(floor.spaces.some(s=>s.code==='317'));assert.ok(floor.spaces.some(s=>s.code==='302'));assert.equal(floor.spaces.filter(s=>s.label==='로비').length,1);
 const two=map.body.floors.find(f=>f.id==='hall-2f');assert.equal(two.sourceAvailable,false);assert.equal(two.spaces.length,0);assert.equal(two.knownRooms[0].code,'211D');assert.doesNotMatch(JSON.stringify(map.body),/password|phone|1029\*|20031021/);
 for(const floor of FLOORS)for(const s of floor.spaces){assert.ok(s.x>=0&&s.y>=0&&s.width>0&&s.height>0);assert.ok(s.x+s.width<=floor.width+.1&&s.y+s.height<=floor.height+.1);}
});
test('room assignment and moving a club update the map and club room together without changing accounts or booking history',async()=>{
 const f=await fixture(),c=await f.club();let map=await getMap(f),rooms=flat(map.body).filter(s=>s.kind==='room'),a=rooms.find(s=>s.code==='307'),b=rooms.find(s=>s.code==='306');const before=f.sqlite.prepare('SELECT * FROM club_accounts').all();
 let saved=await f.call('saveRoomAssignment',roomPayload(map,a,{clubIds:[c.clubId]}));assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(f.sqlite.prepare('SELECT room FROM clubs').get().room,'307');
 saved=await f.call('saveRoomAssignment',roomPayload(saved,b,{clubIds:[c.clubId],code:'306-새호실'}));assert.equal(saved.status,200);assert.equal(f.sqlite.prepare('SELECT room FROM clubs').get().room,'306-새호실');let all=flat(saved.body);assert.deepEqual(all.find(s=>s.id===a.id).clubIds,[]);assert.deepEqual(all.find(s=>s.id===b.id).clubIds,[c.clubId]);assert.deepEqual(f.sqlite.prepare('SELECT * FROM club_accounts').all(),before);
});
test('club rename and room change are reflected in floorplan and preserve contacts',async()=>{
 const f=await fixture(),c=await f.club();await f.call('saveClub',{id:c.clubId,name:'새 동아리명',room:'307'});let map=await getMap(f);assert.deepEqual(flat(map.body).find(s=>s.code==='307').clubLabels,['새 동아리명']);await f.call('saveClub',{id:c.clubId,name:'새 동아리명',room:'306'});map=await getMap(f);assert.deepEqual(flat(map.body).find(s=>s.code==='307').clubIds,[]);assert.deepEqual(flat(map.body).find(s=>s.code==='306').clubIds,[c.clubId]);
});
test('clearing a room changes former clubs to unassigned and rejects duplicate room codes or stale edits',async()=>{
 const f=await fixture(),c=await f.club();let map=await getMap(f),room=flat(map.body).find(s=>s.code==='307');let saved=await f.call('saveRoomAssignment',roomPayload(map,room,{clubIds:[c.clubId]}));assert.equal(saved.status,200);
 assert.equal((await f.call('saveRoomAssignment',roomPayload(map,room,{clubIds:[]}))).status,409);
 assert.equal((await f.call('saveRoomAssignment',roomPayload(saved,room,{code:'306'}))).status,400);
 saved=await f.call('saveRoomAssignment',roomPayload(saved,room,{clubIds:[]}));assert.equal(saved.status,200);assert.equal(f.sqlite.prepare('SELECT room FROM clubs').get().room,'미배정');
});
test('room move audit failure and administrator revocation cannot partially move a club',async()=>{
 const f=await fixture(),c=await f.club();let map=await getMap(f),room=flat(map.body).find(s=>s.code==='307');const p=roomPayload(map,room,{clubIds:[c.clubId]});
 f.sqlite.exec("CREATE TRIGGER fail_map BEFORE INSERT ON audit WHEN NEW.action='SAVE_ROOM_ASSIGNMENT' BEGIN SELECT RAISE(ABORT,'test'); END");assert.equal((await f.call('saveRoomAssignment',p)).status,500);assert.equal(f.sqlite.prepare('SELECT room FROM clubs').get().room,'301');assert.equal((await getMap(f)).body.version,map.body.version);
 f.sqlite.exec('DROP TRIGGER fail_map');f.beforeBatch(()=>f.sqlite.exec('DELETE FROM sessions'));assert.equal((await f.call('saveRoomAssignment',p)).status,401);assert.equal(f.sqlite.prepare('SELECT room FROM clubs').get().room,'301');
});
test('rental navigation and notice selection remain independent and mandatory regardless of old read/off settings',()=>{
 assert.deepEqual(RENTAL_VIEWS,['booking','equipment','board']);for(const view of ['guide','booking','equipment','board','club','admin'])assert.equal(viewFromQuery(view),view);assert.equal(viewFromQuery('account'),'club');
 const site={...structuredClone(DEFAULT_SITE),noticeEnabled:false};for(const view of RENTAL_VIEWS)assert.ok(rentalNotice(view,site)?.title);assert.equal(rentalNotice('guide',site),null);assert.notEqual(rentalNotice('equipment',site).body,rentalNotice('board',site).body);
});
test('separate rental popup settings preserve old place notices and reject malformed text',async()=>{
 const f=await fixture(),settings={...structuredClone(DEFAULT_SITE),equipmentNoticeBody:'장비는 당일 반납',boardNoticeBody:'구성품 확인'};let r=await f.call('saveSiteContent',{baseVersion:'initial',requestKey:crypto.randomUUID(),settings});assert.equal(r.status,200);assert.equal(r.body.settings.equipmentNoticeBody,'장비는 당일 반납');assert.equal(r.body.settings.boardNoticeBody,'구성품 확인');assert.deepEqual(r.body.settings.notices,settings.notices);
 assert.equal((await f.call('saveSiteContent',{baseVersion:r.body.version,requestKey:crypto.randomUUID(),settings:{...settings,boardNoticeBody:''}})).status,400);
});
test('image budget and per-section item count are enforced in the same write as saving',async()=>{
 const f=await fixture();f.sqlite.prepare("INSERT INTO content_entries VALUES(?, 'equipment','占位','',0,0,?,'',NULL,NULL,zeroblob(20971520),'')").run(crypto.randomUUID(),crypto.randomUUID());
 const image={mime:'image/png',base64:readFileSync(new URL('../public/assets/logo.png',import.meta.url)).toString('base64')};assert.equal((await f.call('saveCatalogEntry',entry({image}))).status,409);assert.equal((await catalog(f)).body.entries.length,0);
 // Text-only entries remain available when the image allocation is full.
 assert.equal((await f.call('saveCatalogEntry',entry())).status,200);
 const insert=f.sqlite.prepare("INSERT INTO content_entries VALUES(?, 'board','품목','',?,1,?,'',NULL,NULL,NULL,'')");for(let i=0;i<100;i++)insert.run(crypto.randomUUID(),i,crypto.randomUUID());assert.equal((await f.call('saveCatalogEntry',entry({section:'board'}))).status,409);assert.equal((await catalog(f,'board')).body.entries.length,100);
});
test('legacy room aliases and 2F known room can link to registered clubs without inventing a 2F diagram',async()=>{
 const f=await fixture(),c=await f.club();await f.call('saveClub',{id:c.clubId,name:'신이데아',room:'211D'});let map=await getMap(f);assert.deepEqual(map.body.floors[0].knownRooms[0].clubIds,[c.clubId]);
 await f.call('saveClub',{id:c.clubId,name:'YMCA',room:'313I'});map=await getMap(f);assert.deepEqual(flat(map.body).find(s=>s.code==='313I·313H').clubIds,[c.clubId]);
});
test('additive 0008 migration preserves prior reservations, accounts, penalties and contact defaults',async()=>{
 const f=await fixture(),c=await f.club();const before=['clubs','club_accounts','bookings','penalties'].map(t=>f.sqlite.prepare('SELECT * FROM '+t).all());const migration=readFileSync(new URL('../migrations/0008_catalog_rooms_contacts.sql',import.meta.url),'utf8');f.sqlite.exec(migration);f.sqlite.exec(migration);assert.deepEqual(['clubs','club_accounts','bookings','penalties'].map(t=>f.sqlite.prepare('SELECT * FROM '+t).all()),before);assert.equal(f.sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 const old={...structuredClone(DEFAULT_SITE)};for(const key of ['equipmentNoticeTitle','equipmentNoticeBody','boardNoticeTitle','boardNoticeBody'])delete old[key];const saved=await f.call('saveSiteContent',{baseVersion:'initial',requestKey:crypto.randomUUID(),settings:old});assert.equal(saved.status,200);assert.ok(saved.body.settings.equipmentNoticeBody);assert.equal((await f.call('clubs',{},'admin','GET')).body.clubs[0].contacts.president.name,'');
});
