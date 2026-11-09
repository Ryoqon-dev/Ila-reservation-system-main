import {privacy} from '../lib/privacy.mjs';
import {totp} from '../lib/totp.mjs';
import {hmac,random} from '../lib/security.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {handleApi} from '../lib/service.mjs';
export async function fixture({autoAuth=true}={}) {
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0001_initial.sql','0002_booking_access.sql','0003_club_accounts.sql','0004_site_content.sql','0005_club_portal.sql','0006_data_management.sql','0007_concurrent_club_sessions.sql','0008_catalog_rooms_contacts.sql','0009_club_profiles.sql','0010_security_hardening.sql','0011_scheduled_openings.sql','0012_reservation_read_access.sql'])sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 sqlite.exec('UPDATE privacy_state SET ready=1 WHERE id=1');
 let beforeBatch=null;
 const db={prepare(query){return{bind(...args){args=args.map(value=>value instanceof ArrayBuffer?new Uint8Array(value):value);const execute=()=>({results:sqlite.prepare(query).all(...args),success:true});return{query,first:async()=>sqlite.prepare(query).get(...args)||null,all:async()=>execute(),run:async()=>execute(),_execute:execute}}}},async batch(items){if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook(items)}sqlite.exec('BEGIN');try{const result=items.map(x=>x._execute());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 const config={roomKey:'ab'.repeat(32),bookingKey:'ef'.repeat(32),bootstrapToken:'cd'.repeat(32),piiKey:'12'.repeat(32),mfaKey:'34'.repeat(32)};
 const jars=new Map();
 async function rawCall(op,p={},who='admin',method='POST',headers={}){
  const jar=jars.get(who)||new Map();const query=method==='GET'?'?'+new URLSearchParams({op,...p}):['saveSiteContent','saveCatalogEntry'].includes(op)?'?op='+op:'';
  const request=new Request('https://unit.test/api/system'+query,{method,headers:{'content-type':'application/json',origin:'https://unit.test',cookie:[...jar.entries()].map(([key,value])=>key+'='+value).join('; '),...headers},body:method==='POST'?JSON.stringify({op,...p}):undefined});
  const res=await handleApi(request,db,config),set=res.headers.get('set-cookie');
  if(set){const pair=set.split(';')[0],index=pair.indexOf('=');jar.set(pair.slice(0,index),pair.slice(index+1));jars.set(who,jar)}
  return{status:res.status,body:res.headers.get('content-type')?.includes('application/json')?await res.json():new Uint8Array(await res.arrayBuffer()),headers:res.headers};
 }
 let adminPassword='admin-test-password',mfaSecret='',recoveryCodes=[];
 async function seedProof(){const code=random().slice(0,20);sqlite.prepare('INSERT INTO admin_recovery_codes VALUES(?,?)').run(await hmac(config.mfaKey,'ila-admin-recovery-v1:'+code),new Date().toISOString());sqlite.exec("DELETE FROM attempts WHERE key LIKE 'admin-sensitive%' ");return code}
 async function call(op,p={},who='admin',method='POST',headers={}){
  p={...p};const sensitive=op==='saveReader'||op==='createReadLink'||op==='credentials'||op==='secret'||op==='accountDelete'||op==='accountSave'&&!!p.password||op==='saveMetricsLink'||op==='removeMetricsLink'||op==='executeDataAction';
  if(autoAuth&&who==='admin'&&sensitive&&method==='POST'&&p.code===undefined){p.code=await seedProof();if(op!=='credentials')p.adminPassword??=adminPassword}
  let result=await rawCall(op,p,who,method,headers);
  if(autoAuth&&op==='login'&&result.status===200&&result.body.challenge){if(result.body.enroll){mfaSecret=result.body.secret;result=await rawCall('mfaVerify',{code:await totp(mfaSecret)},who)}else{result=await rawCall('mfaVerify',{code:await seedProof()},who)}if(result.body.recoveryCodes)recoveryCodes=result.body.recoveryCodes}
  if(op==='credentials'&&result.status===200)adminPassword=p.password;
  return result;
 }
 assert.equal((await call('setup',{username:'admin',password:'admin-test-password',setupKey:config.bootstrapToken})).status,200);
 assert.equal((await call('login',{username:'admin',password:'admin-test-password'})).status,200);
 async function club(name='동아리',username='club-user',status='APPROVED'){
  const saved=await call('saveClub',{name,room:'301',password:'4321',changePassword:true});assert.equal(saved.status,200);
  const account=await call('accountSave',{clubId:saved.body.id,username,password:'club-test-password',status});assert.equal(account.status,200);
  return{clubId:saved.body.id,id:account.body.id,username};
 }
 const login=(username,who='club',password='club-test-password')=>call('clubLogin',{username,password},who);
 const book=overrides=>({date:'2030-01-07',room:'심정실',slotIds:['A'],representative:'테스트 대표',phone:'01012345678',agreed:true,inspectionAgreed:true,requestKey:crypto.randomUUID(),...overrides});
 const secure=privacy(config),seedBookingFields=await Promise.all(['비공개 대표자','01012345678','비공개 메모'].map(v=>secure.seal(v)));
 return{call,rawCall,sqlite,db,config,club,login,book,jars,seedBookingFields,seedPenaltyText:await secure.seal('사진 미제출'),mfaSecret,recoveryCodes,seedProof,beforeBatch:fn=>{beforeBatch=fn}};
}
