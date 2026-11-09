import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './account-helpers.mjs';
import {blankClubProfile,filterDirectory,directoryCounts} from '../lib/club-profile.mjs';
const profile=patch=>({type:'REGULAR',typeDate:'2026-09-01',division:'PERFORMANCE',memberCount:25,advisor:'검증 지도교수',baseVersion:'initial',...patch});
const clubs=async(f,who='admin')=>f.call('clubs',{},who,'GET');
const saved=async(f,id)=>{const result=await clubs(f);return result.body.clubs.find(c=>c.id===id)};
const save=(f,id,patch={})=>f.call('saveClub',{id,name:'동아리',room:'301',...patch});
const contacts=patch=>({president:{name:'검증 회장',phone:'010-1234-5678',studentId:'0123456789',...patch},vicePresident:{name:'검증 부회장',phone:'01023456789',studentId:'2026123456'},treasurer:{name:'검증 총무',phone:'01034567890',studentId:'2026987654'}});

test('legacy clubs start unclassified and profiles persist without changing account approval or operational data',async()=>{
 const f=await fixture(),c=await f.club();assert.deepEqual((await saved(f,c.clubId)).profile,blankClubProfile());
 const before=f.sqlite.prepare('SELECT * FROM club_accounts').get();
 assert.equal((await save(f,c.clubId,{profile:profile(),contacts:contacts()})).status,200);
 let row=await saved(f,c.clubId);assert.equal(row.profile.type,'REGULAR');assert.equal(row.profile.typeDate,'2026-09-01');assert.equal(row.profile.division,'PERFORMANCE');assert.equal(row.profile.memberCount,25);assert.equal(row.profile.advisor,'검증 지도교수');assert.notEqual(row.profile.version,'initial');
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM club_accounts').get(),before);
 assert.equal(row.contacts.president.studentId,'0123456789');assert.equal(row.contacts.president.phone,'01012345678');
 const stable=structuredClone(row.profile);await save(f,c.clubId,{name:'변경된 동아리',room:'307',active:false});
 row=await saved(f,c.clubId);assert.deepEqual(row.profile,stable);assert.equal(row.contacts.president.studentId,'0123456789');
});

test('all three club types and four divisions can be selected and unclassified metadata can be saved',async()=>{
 const f=await fixture(),c=await f.club();let version='initial';
 for(const type of ['REGULAR','ASSOCIATE','NEW'])for(const division of ['PERFORMANCE','VOLUNTEER','SPORTS','CULTURE_ACADEMIC']){
  assert.equal((await save(f,c.clubId,{profile:profile({type,division,baseVersion:version})})).status,200);
  const row=await saved(f,c.clubId);assert.equal(row.profile.type,type);assert.equal(row.profile.division,division);version=row.profile.version;
 }
 assert.equal((await save(f,c.clubId,{profile:profile({type:'',typeDate:'',division:'',memberCount:0,advisor:'',baseVersion:version})})).status,200);
 const row=await saved(f,c.clubId);assert.equal(row.profile.memberCount,0);assert.equal(row.profile.type,'');assert.equal(row.profile.typeDate,'');assert.equal(row.profile.advisor,'');
});

test('type date survives ordinary edits and stale versions cannot overwrite profile, club, officers or room layout',async()=>{
 const f=await fixture(),c=await f.club();await save(f,c.clubId,{profile:profile(),contacts:contacts()});
 const row=await saved(f,c.clubId);const next=profile({baseVersion:row.profile.version,memberCount:30});
 assert.equal((await save(f,c.clubId,{profile:next})).status,200);assert.equal((await saved(f,c.clubId)).profile.typeDate,'2026-09-01');
 const tables=['clubs','club_profiles','club_contacts','club_accounts','club_room_assignments','room_layout','audit'],before=tables.map(t=>f.sqlite.prepare('SELECT * FROM '+t).all());
 assert.equal((await save(f,c.clubId,{name:'오래된 변경',room:'306',active:false,profile:profile({baseVersion:row.profile.version,type:'NEW',typeDate:'2026-10-01'}),contacts:contacts({name:'오래된 회장'})})).status,409);
 assert.deepEqual(tables.map(t=>f.sqlite.prepare('SELECT * FROM '+t).all()),before);
});

test('profiles and officer changes commit atomically and revoked administrator sessions cannot write',async()=>{
 const f=await fixture(),c=await f.club(),before=f.sqlite.prepare('SELECT * FROM clubs').get();
 f.sqlite.exec("CREATE TRIGGER fail_profile_audit BEFORE INSERT ON audit WHEN NEW.action='SAVE_CLUB' BEGIN SELECT RAISE(ABORT,'profile rollback'); END");
 assert.equal((await save(f,c.clubId,{name:'실패 변경',room:'307',profile:profile(),contacts:contacts()})).status,500);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM clubs').get(),before);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_profiles').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_contacts').get().n,0);
 f.sqlite.exec('DROP TRIGGER fail_profile_audit');f.beforeBatch(()=>f.sqlite.exec('DELETE FROM sessions'));
 const result=await save(f,c.clubId,{profile:profile(),contacts:contacts()});assert.equal(result.status,401);assert.equal(result.body.scope,'admin');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_profiles').get().n,0);
});

test('invalid club status, dates, divisions and operating data fail before any mutation',async()=>{
 const f=await fixture(),c=await f.club();
 const bad=[{type:'APPROVED'},{type:1},{typeDate:''},{typeDate:'2026-02-30'},{typeDate:'2099-01-01'},{type:'',typeDate:'2026-09-01'},{division:'ADMIN'},{memberCount:-1},{memberCount:1.2},{memberCount:100001},{memberCount:'25'},{advisor:'a'.repeat(41)},{advisor:'bad\u0000name'},{baseVersion:''},{baseVersion:'wrong'},{unknown:'extra'}];
 const before=f.sqlite.prepare('SELECT * FROM clubs').get();
 for(const patch of bad){const result=await save(f,c.clubId,{profile:profile(patch)});assert.equal(result.status,400,JSON.stringify({patch,result:result.body}));}
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM clubs').get(),before);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM club_profiles').get().n,0);
});

test('officer IDs accept exactly ten ASCII digits, preserve leading zeros and remain compatible with old contact writes',async()=>{
 const f=await fixture(),c=await f.club();
 for(const studentId of ['123456789','12345678901','2026-12345','abcdefghij','１２３４５６７８９０','123456789 ',2026123456])assert.equal((await save(f,c.clubId,{contacts:contacts({studentId})})).status,400);
 assert.equal((await save(f,c.clubId,{contacts:contacts()})).status,200);let row=await saved(f,c.clubId);assert.equal(row.contacts.president.studentId,'0123456789');
 const old=contacts();for(const officer of Object.values(old))delete officer.studentId;
 assert.equal((await save(f,c.clubId,{contacts:old})).status,200);row=await saved(f,c.clubId);assert.equal(row.contacts.president.studentId,'0123456789');assert.equal(row.contacts.vicePresident.studentId,'2026123456');
 assert.equal((await save(f,c.clubId,{contacts:contacts({studentId:''})})).status,200);assert.equal((await saved(f,c.clubId)).contacts.president.studentId,'');
});

test('new student IDs and profile metadata remain admin-only and do not enter public, club or CSV responses',async()=>{
 const f=await fixture(),c=await f.club();await save(f,c.clubId,{profile:profile(),contacts:contacts()});await f.login(c.username);
 for(const who of ['guest','club']){
  assert.equal((await clubs(f,who)).status,401);assert.equal((await f.call('saveClub',{name:'외부 변경',room:'301',profile:profile(),contacts:contacts()},who)).status,401);
 }
 for(const [op,p,who,method] of [['myClub',{},'club','GET'],['clubSession',{},'club','GET'],['registrationClubs',{},'guest','GET'],['day',{date:'2030-01-07'},'guest','GET'],['dataExport',{kind:'clubs',from:'2020-01-01',to:'2035-01-01'},'admin','POST']]){
  const result=await f.call(op,p,who,method);assert.equal(result.status,200);assert.doesNotMatch(JSON.stringify(result.body),/0123456789|2026123456|2026987654|검증 지도교수|studentId|memberCount|typeDate/);
 }
});

test('directory counts and intersecting filters include the requested type and division with search and active flags',()=>{
 const rows=[
  {id:'a',name:'공연 A',room:'301',active:1,account_username:'alpha',account_status:'APPROVED',profile:{type:'REGULAR',division:'PERFORMANCE'}},
  {id:'b',name:'봉사 B',room:'302',active:1,account_status:'PENDING',profile:{type:'ASSOCIATE',division:'VOLUNTEER'}},
  {id:'c',name:'체육 C',room:'303',active:1,account_status:'APPROVED',profile:{type:'NEW',division:'SPORTS'}},
  {id:'d',name:'학술 D',room:'304',active:1,account_status:'APPROVED',profile:{type:'REGULAR',division:'CULTURE_ACADEMIC'}},
  {id:'old',name:'이전 공연',room:'305',active:0,profile:{type:'REGULAR',division:'PERFORMANCE'}},
  {id:'unset',name:'미지정',room:'미배정',active:1,profile:blankClubProfile()}
 ];
 const counts=directoryCounts(rows);assert.equal(counts.all,5);assert.equal(counts.PENDING,1);assert.equal(counts.APPROVED,3);assert.deepEqual(counts.types,{REGULAR:2,ASSOCIATE:1,NEW:1});assert.deepEqual(counts.divisions,{PERFORMANCE:1,VOLUNTEER:1,SPORTS:1,CULTURE_ACADEMIC:1});
 assert.deepEqual(filterDirectory(rows,{type:'REGULAR'}).map(c=>c.id),['a','d']);assert.deepEqual(filterDirectory(rows,{division:'PERFORMANCE'}).map(c=>c.id),['a']);assert.deepEqual(filterDirectory(rows,{account:'PENDING',type:'ASSOCIATE',division:'VOLUNTEER'}).map(c=>c.id),['b']);
 assert.deepEqual(filterDirectory(rows,{type:'NEW',division:'PERFORMANCE'}),[]);assert.equal(filterDirectory(rows,{type:'REGULAR',query:'ALPHA'})[0].id,'a');assert.equal(filterDirectory(rows,{query:'302'})[0].id,'b');
 assert.equal(directoryCounts(rows,true).types.REGULAR,3);assert.equal(filterDirectory(rows,{type:'REGULAR',division:'PERFORMANCE',archived:true}).length,2);assert.equal(filterDirectory(rows).length,5);
});

test('0009 migration is repeatable, additive and preserves existing tables and records',async()=>{
 const f=await fixture(),c=await f.club();await save(f,c.clubId,{profile:profile(),contacts:contacts()});
 const names=['clubs','club_profiles','club_contacts','club_accounts','bookings','penalties'],before=names.map(t=>f.sqlite.prepare('SELECT * FROM '+t).all()),shape=f.sqlite.prepare('PRAGMA table_info(clubs)').all();
 const migration=readFileSync(new URL('../migrations/0009_club_profiles.sql',import.meta.url),'utf8');f.sqlite.exec(migration);f.sqlite.exec(migration);
 assert.deepEqual(names.map(t=>f.sqlite.prepare('SELECT * FROM '+t).all()),before);assert.deepEqual(f.sqlite.prepare('PRAGMA table_info(clubs)').all(),shape);assert.equal(f.sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
