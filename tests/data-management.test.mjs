import {privacy} from '../lib/privacy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './account-helpers.mjs';
import {csvDocument,EXPORT_COLUMNS} from '../lib/data-export.mjs';
import {today} from '../lib/rules.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const pwd='admin-test-password';
const penalty=async(f,c,patch={})=>{const r=await f.call('savePenalty',{clubId:c.clubId,date:'2026-01-02',kind:'inspection',points:7,content:'점검 사유',...patch});assert.equal(r.status,200,JSON.stringify(r.body));return r.body.id};
async function prepare(f,params={}){const r=await f.call('prepareDataAction',{action:'reset',clubId:'all',label:'2026학년도 1학기 마감',...params});assert.equal(r.status,200,JSON.stringify(r.body));return r.body.job}
async function download(f,job){let position=0,last,rows=[];do{last=await f.call('dataExport',{jobId:job.id,position});assert.equal(last.status,200,JSON.stringify(last.body));rows.push(...last.body.rows);position=last.body.position}while(last.body.more);return rows}
const execute=(f,job,patch={})=>f.call('executeDataAction',{id:job.id,step:job.step,confirmation:job.action==='reset'?(job.params.clubId?'개별 벌점 초기화':'전체 벌점 초기화'):'이전 기록 삭제',backupConfirmed:true,adminPassword:pwd,...patch});
const report=f=>f.call('myClub',{},'club','GET');
const exportAll=(f,patch={})=>f.call('dataExport',{kind:'penalties',from:'2020-01-01',to:'2035-01-01',...patch});

test('data, CSV, reset, purge and analytics routes reject guests and club sessions',async()=>{
 const f=await fixture(),c=await f.club();await f.login(c.username);
 for(const who of ['guest','club'])for(const [op,method]of [['dataOverview','GET'],['prepareDataAction','POST'],['dataExport','POST'],['executeDataAction','POST'],['metricsLink','GET'],['saveMetricsLink','POST'],['cloudUsage','GET']])assert.equal((await f.call(op,{},who,method)).status,401,op);
});
test('overview reports counts and current penalty points without any credential or image material',async()=>{
 const f=await fixture(),c=await f.club();await penalty(f,c);const r=await f.call('dataOverview',{},'admin','GET');assert.equal(r.status,200);assert.equal(r.body.penalties.points,7);assert.equal(r.body.clubs[0].points,7);assert.equal(r.body.limits.databaseBytes,500000000);assert.equal(r.body.storageBytes,null);assert.doesNotMatch(JSON.stringify(r.body),/password_hash|password_cipher|token_cipher|session_token|admin-test-password|4321/);
});
test('CSV uses only whitelisted fields and neutralizes spreadsheet formulas and leading whitespace',async()=>{
 const row={date:'2026-01-01',club:'  =HYPERLINK("evil")',content:'@SUM(1)',points:10,password:'forbidden-password',image:'forbidden-image',token:'forbidden-token'};
 for(const kind of Object.keys(EXPORT_COLUMNS)){const text=csvDocument(kind,[row]);assert.doesNotMatch(text,/forbidden-password|forbidden-image|forbidden-token/)}
 const text=csvDocument('penalties',[row]);assert.ok(text.startsWith('\uFEFF'));assert.match(text,/'  =HYPERLINK/);assert.match(text,/'@SUM/);assert.doesNotMatch(text,/password|image|token/);
});
test('paginated CSV is complete, date ordered, has no password/code/image columns and rejects unknown datasets',async()=>{
 const f=await fixture(),c=await f.club(),secure=privacy(f.config);const insert=f.sqlite.prepare("INSERT INTO penalties(id,club_id,date,content,points,kind,source_key,voided,created_at) VALUES (?,?,?,?,1,'inspection',NULL,0,?)");for(let i=0;i<405;i++)insert.run('p-'+String(i).padStart(4,'0'),c.clubId,'2026-01-'+String(i%28+1).padStart(2,'0'),await secure.seal('기록 '+i),'2026-01-01T00:00:00Z');
 let cursor=null,revision,rows=[];do{const r=await exportAll(f,{cursor,revision});assert.equal(r.status,200,JSON.stringify(r.body));rows.push(...r.body.rows);cursor=r.body.nextCursor;revision=r.body.revision}while(cursor);
 assert.equal(rows.length,405);assert.equal(new Set(rows.map(r=>r.content)).size,405);assert.deepEqual(rows.map(r=>r.date),rows.map(r=>r.date).sort());assert.doesNotMatch(JSON.stringify(rows),/password|cipher|bookingCode|session|base64|sort_id/);
 assert.equal((await exportAll(f,{kind:'club_accounts'})).status,400);assert.equal((await exportAll(f,{kind:'site_images'})).status,400);assert.equal((await exportAll(f,{from:'2027-01-01',to:'2026-01-01'})).status,400);
});
test('all-club semester close zeros current totals, preserves history/accounts/bookings and is retry safe',async()=>{
 const f=await fixture(),a=await f.club('A동아리','club-a'),b=await f.club('B동아리','club-b');await f.login(a.username);await penalty(f,a,{kind:'photo',points:10});await penalty(f,a);await penalty(f,b,{points:9});
 const accountBefore=f.sqlite.prepare('SELECT * FROM club_accounts ORDER BY id').all();const job=await prepare(f);assert.equal(job.total,3);assert.equal(job.points,26);assert.equal((await download(f,job)).length,3);
 const result=await execute(f,job);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.job.state,'complete');assert.equal((await report(f)).body.totalPoints,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM penalty_records WHERE reset_id IS NOT NULL').get().n,3);assert.deepEqual(f.sqlite.prepare('SELECT * FROM club_accounts ORDER BY id').all(),accountBefore);
 await penalty(f,a,{date:today(),points:3});assert.equal((await execute(f,job)).status,200);assert.equal((await report(f)).body.totalPoints,3);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE action='RESET_PENALTIES'").get().n,1);
 const old=await exportAll(f);assert.equal(old.body.rows.filter(r=>r.semester==='2026학년도 1학기 마감').length,3);
});
test('individual close affects only the selected club and protects closed historical photo dates',async()=>{
 const f=await fixture(),a=await f.club('A동아리','club-a'),b=await f.club('B동아리','club-b');await penalty(f,a,{kind:'photo'});await penalty(f,b,{points:9});const job=await prepare(f,{clubId:a.clubId});await download(f,job);assert.equal((await execute(f,job)).status,200);
 const r=await f.call('penalties',{from:'2020-01-01',to:'2035-01-01'},'admin','GET');assert.equal(r.body.stats.find(c=>c.id===a.clubId).points,0);assert.equal(r.body.stats.find(c=>c.id===b.clubId).points,9);
 assert.equal((await f.call('savePenalty',{clubId:a.clubId,date:'2026-01-02',kind:'photo',points:10,content:'마감 후 중복'})).status,400);const row=f.sqlite.prepare('SELECT id FROM penalties WHERE club_id=?').get(a.clubId);assert.equal((await f.call('voidPenalty',{id:row.id})).status,400);
});
test('reset cannot bypass complete CSV export, explicit confirmation or administrator password',async()=>{
 const f=await fixture(),c=await f.club();await penalty(f,c);const job=await prepare(f);assert.equal((await execute(f,job)).status,400);await download(f,job);
 for(const patch of [{backupConfirmed:false},{confirmation:'잘못된 확인'},{adminPassword:'wrong'}])assert.ok((await execute(f,job,patch)).status>=400);
 assert.equal(f.sqlite.prepare('SELECT reset_id FROM penalty_records').get().reset_id,null);
});
test('plan and paginated exports fail safely when operational data changes or the session changes',async()=>{
 const f=await fixture(),c=await f.club();await penalty(f,c);let job=await prepare(f);await penalty(f,c,{points:3});assert.equal((await f.call('dataExport',{jobId:job.id,position:0})).status,409);
 job=await prepare(f);await download(f,job);await penalty(f,c,{points:4});assert.equal((await execute(f,job)).status,409);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM penalty_records WHERE reset_id IS NOT NULL').get().n,0);
 job=await prepare(f);await f.call('login',{username:'admin',password:pwd},'second-admin');assert.equal((await f.call('dataJob',{id:job.id},'second-admin','GET')).status,403);
});
test('audit failure rolls the reset, period floor and job state back together',async()=>{
 const f=await fixture(),c=await f.club();await penalty(f,c);const job=await prepare(f);await download(f,job);f.sqlite.exec("CREATE TRIGGER fail_reset BEFORE INSERT ON audit WHEN NEW.action='RESET_PENALTIES' BEGIN SELECT RAISE(ABORT,'failure'); END");assert.ok((await execute(f,job)).status>=400);assert.equal(f.sqlite.prepare('SELECT reset_id FROM penalty_records').get().reset_id,null);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM penalty_periods').get().n,0);assert.equal(f.sqlite.prepare('SELECT state FROM data_jobs WHERE id=?').get(job.id).state,'ready');
});
test('expired preview and a session revoked during reset do not modify penalties',async()=>{
 const f=await fixture(),c=await f.club();await penalty(f,c);let job=await prepare(f);f.sqlite.prepare('UPDATE data_jobs SET expires=0 WHERE id=?').run(job.id);assert.equal((await execute(f,job)).status,409);
 job=await prepare(f);await download(f,job);f.beforeBatch(()=>f.sqlite.exec('DELETE FROM sessions'));assert.equal((await execute(f,job)).status,401);assert.equal(f.sqlite.prepare('SELECT reset_id FROM penalty_records').get().reset_id,null);
});
test('cleanup deletes only past bookings with receipts and keeps future bookings and all accounts',async()=>{
 const f=await fixture(),c=await f.club();const r=await f.call('book',f.book({clubId:c.clubId,force:true,reason:'보존 검증'}));assert.equal(r.status,200);const pastId=r.body.id;f.sqlite.prepare('UPDATE bookings SET date=? WHERE id=?').run('2026-01-02',pastId);const future=await f.call('book',f.book({clubId:c.clubId,force:true,reason:'미래 보존'}));assert.equal(future.status,200);const before=f.sqlite.prepare('SELECT * FROM club_accounts').all();
 const job=await prepare(f,{action:'cleanup',kind:'bookings',before:'2026-02-01'});assert.equal(job.total,1);const rows=await download(f,job);assert.equal(rows.length,1);assert.equal((await execute(f,job)).status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM booking_access WHERE booking_id=?').get(pastId).n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);assert.equal(f.sqlite.prepare('SELECT id FROM bookings').get().id,future.body.id);assert.deepEqual(f.sqlite.prepare('SELECT * FROM club_accounts').all(),before);
});
test('penalty cleanup preserves current effective totals, deletes only closed/voided history, and batches past audits',async()=>{
 const f=await fixture(),c=await f.club();const id=await penalty(f,c);await penalty(f,c,{points:3});await f.call('voidPenalty',{id});let job=await prepare(f,{action:'cleanup',kind:'penalties',before:'2026-02-01'});assert.equal(job.total,1);await download(f,job);assert.equal((await execute(f,job)).status,200);assert.equal(f.sqlite.prepare('SELECT SUM(points) n FROM penalties WHERE voided=0').get().n,3);
 const insert=f.sqlite.prepare('INSERT INTO audit VALUES (?,?,?,?)');for(let i=0;i<501;i++)insert.run('old-'+i,'TEST','old','2026-01-01T00:00:00Z');job=await prepare(f,{action:'cleanup',kind:'audit',before:'2026-02-01'});assert.equal(job.total,501);await download(f,job);let r=await execute(f,job);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.job.processed,250);const again=await execute(f,job);assert.equal(again.body.job.processed,250);r=await execute(f,r.body.job);assert.equal(r.body.job.processed,500);r=await execute(f,r.body.job);assert.equal(r.body.job.state,'complete');assert.equal(r.body.job.processed,501);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE id LIKE 'old-%'").get().n,0);
});
test('cleanup refuses today/future cutoffs and unsupported or credential-bearing targets',async()=>{
 const f=await fixture();for(const p of [{kind:'clubs',before:'2026-01-01'},{kind:'club_accounts',before:'2026-01-01'},{kind:'bookings',before:today()},{kind:'penalties',before:'2035-01-01'}])assert.equal((await f.call('prepareDataAction',{action:'cleanup',...p})).status,400);
});
test('normal CSV retry after an audit revision change cannot quietly mix two snapshots',async()=>{
 const f=await fixture(),c=await f.club();const a=await exportAll(f);await penalty(f,c);assert.equal((await exportAll(f,{revision:a.body.revision})).status,409);
});
test('data-management migration preserves every existing penalty value and starts a non-destructive revision counter',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const name of ['0001_initial.sql','0002_booking_access.sql','0003_club_accounts.sql','0004_site_content.sql','0005_club_portal.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.prepare('INSERT INTO clubs VALUES (?,?,?,?,?,1,?)').run('club','기존 동아리','old-club','301','encrypted-room-value','2026-01-01');db.prepare('INSERT INTO penalties VALUES (?,?,?,?,?,?,?,?,?)').run('p','club','2026-01-01','기존 사유',10,'photo','photo:club:2026-01-01',0,'2026-01-01T00:00:00Z');db.prepare('INSERT INTO audit VALUES (?,?,?,?)').run('a','OLD','old','2026-01-01');
 const before=db.prepare('SELECT * FROM penalties').get(),clubs=db.prepare('SELECT * FROM clubs').all();db.exec(readFileSync(new URL('../migrations/0006_data_management.sql',import.meta.url),'utf8'));const after=db.prepare('SELECT * FROM penalty_records').get();assert.equal(after.reset_id,null);delete after.reset_id;assert.deepEqual(after,before);assert.deepEqual(db.prepare('SELECT * FROM clubs').all(),clubs);assert.equal(db.prepare('SELECT version FROM data_revision').get().version,0);db.prepare('INSERT INTO audit VALUES (?,?,?,?)').run('b','NEW','new','2026-01-02');assert.equal(db.prepare('SELECT version FROM data_revision').get().version,1);db.prepare('INSERT INTO penalties VALUES (?,?,?,?,?,?,?,?,?)').run('legacy-write','club','2026-01-02','旧版 입력',3,'inspection',null,0,'2026-01-02');assert.equal(db.prepare('SELECT COUNT(*) n FROM penalties').get().n,2);
});
