import {reservationRead} from './reservation-read.mjs';
import {scheduledOpenings} from './scheduled-openings.mjs';
import {openingRows,roomOpenSQL,cleanOpening} from './opening-time.mjs';
import {adminAuth} from './admin-auth.mjs';
import {privacy} from './privacy.mjs';
import {holidays2026} from './legacy-calendar.mjs';
import {ROOMS,SLOTS,today,minuteNow,validDate,dateRange,resolveSlots,normalizedName,field,phoneValue,credentials,assert,hm,csvCell} from './rules.mjs';
import {hex,unhex,random,hash,passwordHash,crypt,json,failure,equal} from './security.mjs';
import {clubAccounts} from './accounts.mjs';
import {siteContent} from './site-content.mjs';
import {photoPenaltyStatement} from './penalties.mjs';
import {dataManagement} from './data-management.mjs';
import {catalog} from './catalog.mjs';
import {clubRooms,validateContacts,contactDefaults} from './club-rooms.mjs';
import {blankClubProfile,validateClubProfile} from './club-profile.mjs';
import {bookingOrder} from './booking-order.mjs';
export {passwordHash} from './security.mjs';
const encoder=new TextEncoder();
const active="status IN ('APPROVED','OVERRIDE')";
const bookingSelect="SELECT b.*,c.name AS club,c.room AS club_room FROM bookings b JOIN clubs c ON c.id=b.club_id";
async function readJsonBody(req,limit=30000){
 const tooLarge=()=>Object.assign(new Error('요청이 너무 큽니다.'),{status:413});
 if(Number(req.headers.get('content-length')||0)>limit)throw tooLarge();
 const reader=req.body?.getReader();assert(reader,'JSON 요청이 필요합니다.');const decoder=new TextDecoder();let size=0,raw='';
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw tooLarge()}raw+=decoder.decode(value,{stream:true})}raw+=decoder.decode()}finally{reader.releaseLock()}
 let value;try{value=JSON.parse(raw)}catch{throw new Error('JSON 요청 형식을 확인해주세요.')}
 assert(value&&typeof value==='object'&&!Array.isArray(value),'요청 항목을 올바른 형식으로 입력해주세요.');return value;
}
export async function handleApi(req,db,config={}){
 const sql=(query,...args)=>db.prepare(query).bind(...args);
 const all=async(query,...args)=>(await sql(query,...args).all()).results;
 const first=(query,...args)=>sql(query,...args).first();
 const audit=(action,target)=>sql('INSERT INTO audit VALUES (?,?,?,?)',crypto.randomUUID(),action,target,new Date().toISOString());
 const auditChanged=(action,target)=>sql('INSERT INTO audit SELECT ?,?,?,? WHERE changes()>0',crypto.randomUUID(),action,target,new Date().toISOString());
 const now=Date.now();
 const auth=adminAuth(req,db,config,{sql,first,all,throttle,auditChanged});
 const {token,isAdmin,requireAdmin,adminGuard,requireProof}=auth;
 const privateData=privacy(config);
 const accounts=clubAccounts(req,db,config,{sql,all,first,audit,auditChanged,isAdmin,requireAdmin,adminGuard,requireProof,privateData,throttle,now});
 const rooms=clubRooms(db,{sql,all,first,requireAdmin,adminGuard,auditChanged});
 const canSetup=()=>!!config.bootstrapToken;
 const setupAuthorized=async supplied=>typeof supplied==='string'&&/^[a-f0-9]{64}$/.test(supplied)&&!!config.bootstrapToken&&(await hash(supplied))===(await hash(config.bootstrapToken));
 const makeBookingCode=async requestKey=>{assert(/^[a-f0-9]{64}$/.test(config.bookingKey||''),'예약 보안 설정을 확인해주세요.');const key=await crypto.subtle.importKey('raw',unhex(config.bookingKey),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode('ila-receipt-v1:'+requestKey)))};
 const receipt=async row=>json({ok:true,id:row.id,date:row.date,room:row.room,start:row.start,end:row.end,bookingCode:await makeBookingCode(row.request_key)});
 const replay=async(row,p,range,phone,representative,guard)=>{row=await privateData.booking(row);assert(['APPROVED','OVERRIDE'].includes(row.status),'취소되거나 삭제된 예약 요청입니다. 새 시간대를 선택해주세요.');assert(row.phone===phone&&row.club_id===p.clubId&&row.date===p.date&&row.room===p.room&&row.start===range.start&&row.end===range.end&&row.representative===representative&&!!row.override===(p.force===true),'예약 요청의 내용이 변경되었습니다. 예약 내역을 확인해주세요.');const codeHash=await hash(await makeBookingCode(row.request_key));const stored=await first('SELECT code_hash FROM booking_access WHERE booking_id=?',row.id);assert(!stored||stored.code_hash===codeHash,'예약 보안 키가 변경되었습니다. 지원부에 문의해주세요.');if(!stored)await db.batch([sql("INSERT INTO booking_access SELECT id,? FROM bookings WHERE id=? AND status IN ('APPROVED','OVERRIDE') AND "+guard.query+' ON CONFLICT(booking_id) DO NOTHING',codeHash,row.id,...guard.args),auditChanged('REPAIR_RECEIPT',row.id)]);if(!await first('SELECT 1 AS ok WHERE '+guard.query,...guard.args))throw failure('로그인이 만료되었습니다. 다시 로그인해주세요.',401,p.force?'admin':'club');return await receipt(row)};
 const verifyBookingCode=async code=>{assert(typeof code==='string'&&/^[a-f0-9]{64}$/.test(code),'발급된 예약 확인코드를 입력해주세요.');return hash(code)};
 async function throttle(kind,limit,global=false){const identity=global?'all':req.headers.get('cf-connecting-ip')||'local';const key=kind+':'+await hash(identity);const result=await sql('INSERT INTO attempts(key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END RETURNING count',key,now+15*60000,now,now).first();if(result.count>limit)throw Object.assign(new Error('요청이 너무 많습니다. 15분 후 다시 시도해주세요.'),{status:429});return key}
 try{
  const url=new URL(req.url);let p={};
  if(req.method==='POST'){assert(req.headers.get('sec-fetch-site')!=='cross-site','다른 사이트에서 보낸 요청은 처리할 수 없습니다.');const origin=req.headers.get('origin');assert(!origin||origin===url.origin,'요청 출처가 올바르지 않습니다.');assert((req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()==='application/json','JSON 요청이 필요합니다.');if(['saveSiteContent','saveCatalogEntry'].includes(url.searchParams.get('op'))){await requireAdmin();const largeOp=url.searchParams.get('op');p=await readJsonBody(req,largeOp==='saveSiteContent'?1700000:300000);assert(p.op===largeOp,'설정 저장 요청을 확인해주세요.')}else p=await readJsonBody(req)}
  const op=req.method==='GET'?url.searchParams.get('op'):p.op;
  if(op==='serverTime'&&req.method==='GET')return json({serverNow:Date.now(),serverDate:today(),timezone:'Asia/Seoul'});
  const authResponse=await auth.handle(op,req.method==='GET'?Object.fromEntries(url.searchParams):p,req.method);if(authResponse)return authResponse;
  if(!['setup'].includes(op)&&!(await first('SELECT ready FROM privacy_state WHERE id=1'))?.ready)return json({error:'보안 업데이트 중입니다. 잠시 후 다시 접속해주세요.'},503);
  const readResponse=await reservationRead(req,db,config,{sql,all,first,requireAdmin,adminGuard,requireProof,auditChanged,throttle}).handle(op,req.method==='GET'?Object.fromEntries(url.searchParams):p,req.method);if(readResponse)return readResponse;
  const contentResponse=await siteContent(req,db,{sql,first,requireAdmin,adminGuard}).handle(op,req.method==='GET'?Object.fromEntries(url.searchParams):p,req.method);if(contentResponse)return contentResponse;
  const catalogResponse=await catalog(req,db,{sql,all,first,requireAdmin,adminGuard,auditChanged}).handle(op,req.method==='GET'?Object.fromEntries(url.searchParams):p,req.method);if(catalogResponse)return catalogResponse;
  const roomResponse=await rooms.handle(op,req.method==='GET'?Object.fromEntries(url.searchParams):p,req.method);if(roomResponse)return roomResponse;
  const scheduleResponse=await scheduledOpenings(db,{sql,all,first,requireAdmin,adminGuard}).handle(op,req.method==='GET'?Object.fromEntries(url.searchParams):p,req.method);if(scheduleResponse)return scheduleResponse;
  const accountResponse=await accounts.handle(op,req.method==='GET'?Object.fromEntries(url.searchParams):p,req.method);if(accountResponse)return accountResponse;
  const dataResponse=await dataManagement(req,db,config,{sql,all,first,audit,auditChanged,requireAdmin,adminGuard,requireProof,privateData,throttle}).handle(op,req.method==='GET'?Object.fromEntries(url.searchParams):p,req.method);if(dataResponse)return dataResponse;
  if(op==='setup'&&req.method==='POST'){
   await throttle('setup',10);assert(await setupAuthorized(p.setupKey),'최초 설정 키가 올바르지 않습니다.');assert(!await first('SELECT id FROM admins WHERE id=1'),'이미 관리자 계정이 설정되어 있습니다.');const c=credentials(p.username,p.password);const salt=random();await db.batch([sql('INSERT INTO admins VALUES (1,?,?,?)',c.username,await auth.hashedPassword(c.password,salt),salt),...holidays2026.map(([date,name])=>sql("INSERT INTO day_events VALUES (?,'holiday',?) ON CONFLICT(date,kind) DO NOTHING",date,name)),audit('ADMIN_SETUP','1')]);return json({ok:true});
  }
  if(op==='day'&&req.method==='GET'){
   const date=validDate(url.searchParams.get('date'));const results=await db.batch([openingRows(sql,date),sql(`SELECT room,start,end FROM bookings WHERE date=? AND ${active}`,date),sql('SELECT kind,name FROM day_events WHERE date=?',date),sql('SELECT id,name,room FROM clubs WHERE active=1 ORDER BY name')]);const [openings,bookings,events,clubs]=results.map(r=>r.results);const weekday=new Date(date+'T12:00:00Z').getUTCDay();return json({date,openings:openings.map(({date,...row})=>cleanOpening(row)),bookings,events,clubs,serverNow:Date.now(),restricted:[0,5,6].includes(weekday)||events.some(x=>x.kind==='holiday'),serverDate:today(),serverMinute:minuteNow()});
  }
  if(op==='book'&&req.method==='POST'){
   const force=p.force===true;let actor=null;if(force)await requireAdmin();else{actor=await accounts.requireRental();if(p.clubId&&p.clubId!==actor.club_id)throw failure('로그인한 동아리로만 예약할 수 있습니다.',403,'club');p.clubId=actor.club_id}await throttle('book',300);const guard=force?await adminGuard():accounts.rentalGuard(actor);validDate(p.date,true);assert(ROOMS.includes(p.room),'장소를 선택하세요.');const range=resolveSlots(p.slotIds,force);assert(typeof p.clubId==='string','동아리를 선택하세요.');const representative=field(p.representative,'대표자',40),phone=phoneValue(p.phone);const note=String(p.note||'').slice(0,500),reason=force?field(p.reason,'추가승인 사유',300):'';assert(typeof p.requestKey==='string'&&/^[a-f0-9-]{36}$/.test(p.requestKey),'예약 요청 정보가 올바르지 않습니다.');
   const previous=await first('SELECT * FROM bookings WHERE request_key=?',p.requestKey);if(previous)return await replay(previous,p,range,phone,representative,guard);
   validDate(p.date);assert(p.date>today()||range.start>minuteNow(),'이미 시작된 시간은 예약할 수 없습니다.');const club=await first('SELECT id FROM clubs WHERE id=? AND active=1',p.clubId);assert(club,'등록된 동아리를 선택하세요.');assert(force||p.agreed===true,'이용규정 동의가 필요합니다.');const inspection=!!await first("SELECT date FROM day_events WHERE date=? AND kind='inspection'",p.date);assert(!inspection||p.inspectionAgreed===true,'동방점검 참석에 동의해주세요.');
   const id='R-'+crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();const codeHash=await hash(await makeBookingCode(p.requestKey));
   // Eligibility and INSERT execute as one serialized SQLite statement, preventing races.
   const insert=sql(`WITH i AS (SELECT ? AS id,? AS request_key,? AS date,? AS room,? AS start,? AS end,? AS club_id,? AS representative,? AS phone,? AS note,? AS status,? AS override,? AS reason,? AS inspection,0 AS entry_photo,0 AS exit_photo,? AS created_at)
    INSERT INTO bookings SELECT i.* FROM i WHERE
    EXISTS(SELECT 1 FROM clubs c WHERE c.id=i.club_id AND c.active=1)
    AND ${guard.query}
    AND (i.override=1 OR ${roomOpenSQL('i.date','i.room')})
    AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.date=i.date AND b.room=i.room AND b.status IN ('APPROVED','OVERRIDE') AND b.start<i.end AND b.end>i.start)
    AND (i.override=1 OR NOT (strftime('%w',i.date) IN ('0','5','6') OR EXISTS(SELECT 1 FROM day_events e WHERE e.date=i.date AND e.kind='holiday')) OR i.end-i.start+COALESCE((SELECT SUM(b.end-b.start) FROM bookings b WHERE b.date=i.date AND b.club_id=i.club_id AND b.status IN ('APPROVED','OVERRIDE')),0)<=240)
    AND (i.inspection=1 OR NOT EXISTS(SELECT 1 FROM day_events e WHERE e.date=i.date AND e.kind='inspection')) RETURNING id`,id,p.requestKey,p.date,p.room,range.start,range.end,p.clubId,await privateData.seal(representative),await privateData.seal(phone),await privateData.seal(note),force?'OVERRIDE':'APPROVED',force?1:0,await privateData.seal(reason),inspection?1:0,new Date().toISOString(),...guard.args,Date.now());
   let results;
   try{results=await db.batch([insert,sql('INSERT INTO booking_access SELECT id,? FROM bookings WHERE id=? ON CONFLICT(booking_id) DO NOTHING',codeHash,id),sql('INSERT INTO audit SELECT ?,?,?,? FROM bookings WHERE id=?',crypto.randomUUID(),force?'FORCE_BOOK':'BOOK',id,new Date().toISOString(),id)])}catch(error){if(String(error.message).includes('bookings.request_key')){const duplicate=await first('SELECT * FROM bookings WHERE request_key=?',p.requestKey);if(duplicate)return await replay(duplicate,p,range,phone,representative,guard)}throw error}
   const inserted=results[0].results?.[0];
   if(!inserted){
    // A concurrent identical request may win after the early replay check.
    // The overlap predicate then skips INSERT without raising a UNIQUE error.
    const committed=await first('SELECT * FROM bookings WHERE request_key=?',p.requestKey);
    if(committed)return await replay(committed,p,range,phone,representative,guard);
    if(!force){const live=accounts.rentalGuard(actor);if(!await first('SELECT 1 AS ok WHERE '+live.query,...live.args)){await accounts.requireRental();throw failure('장소대여 이용 권한이 변경되었습니다. 다시 확인해주세요.',423,'rental')}}else await requireAdmin();
    if(!force&&!await first('SELECT 1 AS ok WHERE '+roomOpenSQL('?','?'),p.date,p.room,p.date,p.room,Date.now()))throw new Error('ROOM_CLOSED');
    if(await first(`SELECT id FROM bookings WHERE date=? AND room=? AND ${active} AND start<? AND end>?`,p.date,p.room,range.end,range.start))throw new Error('BOOKING_OVERLAP');
    if(!inspection&&await first("SELECT date FROM day_events WHERE date=? AND kind='inspection'",p.date))throw new Error('INSPECTION_REQUIRED');
    if(!await first('SELECT id FROM clubs WHERE id=? AND active=1',p.clubId))throw new Error('해당 동아리가 비활성화되었습니다.');
    throw new Error('CLUB_LIMIT');
   }
   return await receipt({id,request_key:p.requestKey,date:p.date,room:p.room,...range});
  }
  if(op==='lookup'&&req.method==='POST'){const actor=await accounts.requireRental();await throttle('lookup',300);const phone=phoneValue(p.phone),codeHash=await verifyBookingCode(p.bookingCode);const rows=await all('SELECT b.id,b.date,b.room,b.start,b.end,b.status,b.inspection,b.phone,c.name AS club FROM bookings b JOIN clubs c ON c.id=b.club_id JOIN booking_access a ON a.booking_id=b.id WHERE b.club_id=? AND a.code_hash=? AND b.status<>? ORDER BY b.date DESC,b.start DESC LIMIT 100',actor.club_id,codeHash,'DELETED');return json({bookings:(await Promise.all(rows.map(r=>privateData.fields(r,['phone'])))).filter(r=>r.phone===phone).map(({phone,...r})=>r)})}
  if(op==='cancel'&&req.method==='POST'){
   const actor=await accounts.requireRental();await throttle('cancel',300);
   const row=await first("SELECT * FROM bookings WHERE id=? AND club_id=? AND status<>'DELETED'",String(p.id),actor.club_id);
   assert(row,'예약을 찾을 수 없습니다.');
   // Old receipts remain usable, but every lookup/cancellation is scoped to the signed-in club.
   if(p.phone!==undefined||p.bookingCode!==undefined){const phone=phoneValue(p.phone),codeHash=await verifyBookingCode(p.bookingCode);assert(await privateData.open(row.phone)===phone&&await first('SELECT booking_id FROM booking_access WHERE booking_id=? AND code_hash=?',row.id,codeHash),'예약 확인 정보가 일치하지 않습니다.')}
   if(row.status==='CANCELLED')return json({ok:true});
   assert(row.date>today()||(row.date===today()&&row.start>minuteNow()),'시작된 예약은 지원부에 취소를 요청하세요.');const g=accounts.rentalGuard(actor);
   const changed=await db.batch([sql("UPDATE bookings SET status='CANCELLED' WHERE id=? AND club_id=? AND status IN ('APPROVED','OVERRIDE') AND "+g.query+' RETURNING id',row.id,actor.club_id,...g.args),auditChanged('USER_CANCEL',row.id)]);
   if(!changed[0].results.length){const live=accounts.rentalGuard(actor);if(!await first('SELECT 1 AS ok WHERE '+live.query,...live.args)){await accounts.requireRental();throw failure('장소대여 이용 권한이 변경되었습니다. 다시 확인해주세요.',423,'rental')};throw new Error('예약 상태가 변경되었습니다. 다시 조회해주세요.')}return json({ok:true});
  }
  if(op==='myReceipt'&&req.method==='POST'){const actor=await accounts.requireRental();const g=accounts.rentalGuard(actor);const row=await first("SELECT * FROM bookings WHERE id=? AND club_id=? AND status IN ('APPROVED','OVERRIDE') AND "+g.query,String(p.id),actor.club_id,...g.args);assert(row,'확인서를 발급할 예약을 찾을 수 없습니다.');return await receipt(row)}
  await requireAdmin();
  if(op==='dashboard'&&req.method==='GET'){
   const from=validDate(url.searchParams.get('from'),true),to=validDate(url.searchParams.get('to'),true);assert(from<=to,'조회 기간을 확인하세요.');const sort=url.searchParams.get('sort')??'date-asc',order=bookingOrder(sort);const rows=await db.batch([sql(bookingSelect+' WHERE b.date BETWEEN ? AND ? AND b.status<>? ORDER BY '+order+' LIMIT 1001',from,to,'DELETED'),openingRows(sql,from,to),sql('SELECT * FROM day_events WHERE date BETWEEN ? AND ? ORDER BY date',from,to),sql("SELECT club_id,date,reset_id,points FROM penalty_records WHERE kind='photo' AND voided=0 AND date BETWEEN ? AND ?",from,to)]);const bookings=await Promise.all(rows[0].results.slice(0,1000).map(b=>privateData.booking(b)));await requireAdmin();return json({bookings,truncated:rows[0].results.length>1000,sort,openings:rows[1].results.map(cleanOpening),serverNow:Date.now(),events:rows[2].results,photoPenalties:rows[3].results});
  }
  if(op==='clubs'&&req.method==='GET'){
   const rows=await all("SELECT c.id,c.name,c.room,c.active,c.updated_at,co.contacts AS contacts_json,cp.type AS profile_type,cp.type_date AS profile_date,cp.division AS profile_division,cp.member_count AS profile_members,cp.advisor AS profile_advisor,cp.version AS profile_version,COALESCE((SELECT start_date FROM penalty_periods pp WHERE pp.club_id=c.id),'') AS penalty_start,c.password<>? AS password_set,a.id AS account_id,a.username AS account_username,a.status AS account_status FROM clubs c LEFT JOIN club_accounts a ON a.club_id=c.id LEFT JOIN club_contacts co ON co.club_id=c.id LEFT JOIN club_profiles cp ON cp.club_id=c.id ORDER BY c.active DESC,c.name",'');
   return json({clubs:await Promise.all(rows.map(async({contacts_json,profile_type,profile_date,profile_division,profile_members,profile_advisor,profile_version,...row})=>({...row,contacts:contactDefaults(await privateData.contacts(contacts_json)),profile:profile_version?{type:profile_type,typeDate:profile_date,division:profile_division,memberCount:profile_members,advisor:await privateData.open(profile_advisor),version:profile_version}:blankClubProfile()})))});
  }
  if(op==='secret'&&req.method==='POST'){await requireProof(p.adminPassword,p.code);const row=await first('SELECT password FROM clubs WHERE id=?',String(p.id));assert(row,'동아리를 찾을 수 없습니다.');const g=await adminGuard();const logged=await sql('INSERT INTO audit SELECT ?,?,?,? WHERE '+g.query+' RETURNING id',crypto.randomUUID(),'VIEW_ROOM_PASSWORD',String(p.id),new Date().toISOString(),...g.args).all();if(!logged.results.length)throw failure('관리자 로그인이 만료되었습니다.',401,'admin');return json({password:await crypt(row.password,config.roomKey,true)})}
  if(op==='saveClub'&&req.method==='POST'){
   const name=field(p.name,'동아리명',60),room=field(p.room,'동아리방 호수',40),id=p.id?String(p.id):crypto.randomUUID();
   const existing=await first('SELECT id FROM clubs WHERE id=?',id);assert(!p.id||existing,'동아리를 찾을 수 없습니다.');
   const profile=p.profile===undefined?null:validateClubProfile(p.profile),profileVersion=profile?crypto.randomUUID():null;
   const previousContacts=p.contacts===undefined?null:await first('SELECT contacts FROM club_contacts WHERE club_id=?',id);
   const contacts=p.contacts===undefined?null:validateContacts(p.contacts,await privateData.contacts(previousContacts?.contacts));
   const password=p.changePassword?await crypt(String(p.password||'').slice(0,128),config.roomKey):null,stamp=new Date().toISOString(),g=await adminGuard(),spaceId=await rooms.findSpace(room);
   const versionQuery=profile?" AND COALESCE((SELECT version FROM club_profiles WHERE club_id=?),'initial')=?":'',versionArgs=profile?[id,profile.baseVersion]:[];
   const startGuard=g.query+versionQuery,startArgs=[...g.args,...versionArgs];
   const statement=existing?sql('UPDATE clubs SET name=?,name_key=?,room=?,password=COALESCE(?,password),active=?,updated_at=? WHERE id=? AND '+startGuard+' RETURNING id',name,normalizedName(name),room,password,p.active===false?0:1,stamp,id,...startArgs):sql('INSERT INTO clubs SELECT ?,?,?,?,?,1,? WHERE '+startGuard+' RETURNING id',id,name,normalizedName(name),room,password||'',stamp,...startArgs);
   const basicGate=`EXISTS(SELECT 1 FROM clubs WHERE id=? AND updated_at=?) AND ${g.query}`,basicArgs=[id,stamp,...g.args],changes=[statement];
   // Optimistic version checks are inside the atomic write batch, not just an earlier read.
   if(profile)changes.push(sql('INSERT INTO club_profiles(club_id,type,type_date,division,member_count,advisor,version,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE '+basicGate+versionQuery+' ON CONFLICT(club_id) DO UPDATE SET type=excluded.type,type_date=excluded.type_date,division=excluded.division,member_count=excluded.member_count,advisor=excluded.advisor,version=excluded.version,updated_at=excluded.updated_at',id,profile.type,profile.typeDate,profile.division,profile.memberCount,await privateData.seal(profile.advisor),profileVersion,stamp,...basicArgs,...versionArgs));
   const gate=basicGate+(profile?' AND EXISTS(SELECT 1 FROM club_profiles WHERE club_id=? AND version=?)':''),args=[...basicArgs,...(profile?[id,profileVersion]:[])];
   if(contacts)changes.push(sql('INSERT INTO club_contacts SELECT ?,? WHERE '+gate+' ON CONFLICT(club_id) DO UPDATE SET contacts=excluded.contacts',id,await privateData.seal(JSON.stringify(contacts)),...args));
   changes.push(spaceId?sql('INSERT INTO club_room_assignments SELECT ?,? WHERE '+gate+' ON CONFLICT(club_id) DO UPDATE SET space_id=excluded.space_id',id,spaceId,...args):sql('DELETE FROM club_room_assignments WHERE club_id=? AND '+gate,id,...args));
   changes.push(sql('UPDATE room_layout SET version=?,updated_at=? WHERE id=1 AND '+gate,crypto.randomUUID(),stamp,...args));
   if(p.active===false)changes.push(sql('UPDATE club_accounts SET session_token=NULL,session_expires=0,version=version+1 WHERE club_id=? AND '+gate,id,...args));
   changes.push(sql('INSERT INTO audit SELECT ?,?,?,? WHERE '+gate,crypto.randomUUID(),'SAVE_CLUB',id,stamp,...args));
   const result=await db.batch(changes);if(!result[0].results.length){await requireAdmin();throw failure('다른 곳에서 동아리 정보가 변경되었습니다. 최신 목록을 불러온 뒤 다시 수정해주세요.',409)}return json({ok:true,id});
  }
  if(op==='openings'&&req.method==='POST'){
   const dates=dateRange(p.from||'',p.to||'',Array.isArray(p.dates)?p.dates:[]);assert(Array.isArray(p.rooms)&&p.rooms.length>0&&p.rooms.every(r=>ROOMS.includes(r)),'장소를 선택하세요.');assert(typeof p.open==='boolean','오픈 상태를 확인하세요.');const rooms=[...new Set(p.rooms)];const targets=dates.flatMap(date=>rooms.map(room=>({date,room})));
   // One conditional UPSERT checks every target before writing any target.
   const g=await adminGuard();const change=sql(`WITH targets AS (SELECT json_extract(value,'$.date') AS date,json_extract(value,'$.room') AS room FROM json_each(?))
    INSERT INTO openings SELECT t.date,t.room,? FROM targets t WHERE ${g.query} AND (?=1 OR NOT EXISTS(SELECT 1 FROM bookings b JOIN targets x ON b.date=x.date AND b.room=x.room WHERE b.status IN ('APPROVED','OVERRIDE')))
    ON CONFLICT(date,room) DO UPDATE SET is_open=excluded.is_open RETURNING date`,JSON.stringify(targets),p.open?1:0,...g.args,p.open?1:0);
   const bulkId=crypto.randomUUID();const result=await db.batch([change,sql('INSERT INTO audit SELECT ?,?,?,? WHERE changes()>0',bulkId,p.open?'BULK_OPEN':'BULK_CLOSE',dates.join(',')+' / '+rooms.join(','),new Date().toISOString()),sql(`DELETE FROM opening_schedule_targets WHERE EXISTS(SELECT 1 FROM json_each(?) jt WHERE json_extract(jt.value,'$.date')=opening_schedule_targets.date AND json_extract(jt.value,'$.room')=opening_schedule_targets.room) AND EXISTS(SELECT 1 FROM audit WHERE id=?) AND ${g.query}`,JSON.stringify(targets),bulkId,...g.args)]);const changed=result[0];if(changed.results.length!==targets.length)await requireAdmin();assert(changed.results.length===targets.length,'CLOSE_BUSY');return json({ok:true,count:targets.length,dates});
  }
  if(op==='event'&&req.method==='POST'){validDate(p.date,true);assert(['holiday','inspection'].includes(p.kind),'일정 종류를 확인하세요.');const g=await adminGuard();const statement=p.remove?sql('DELETE FROM day_events WHERE date=? AND kind=? AND '+g.query,p.date,p.kind,...g.args):sql('INSERT INTO day_events SELECT ?,?,? WHERE '+g.query+' ON CONFLICT(date,kind) DO UPDATE SET name=excluded.name',p.date,p.kind,field(p.name,'일정명',80),...g.args);await db.batch([statement,auditChanged('DAY_EVENT',p.date+' '+p.kind)]);await requireAdmin();return json({ok:true})}
  if(op==='bookingAction'&&req.method==='POST'){
   const row=await first('SELECT * FROM bookings WHERE id=?',String(p.id));assert(row,'예약을 찾을 수 없습니다.');const statements=[],g=await adminGuard();
   if(p.action==='cancel'){assert(['APPROVED','OVERRIDE'].includes(row.status),'활성 예약만 취소할 수 있습니다.');statements.push(sql("UPDATE bookings SET status='CANCELLED' WHERE id=? AND status IN ('APPROVED','OVERRIDE') AND "+g.query+' RETURNING id',row.id,...g.args))}
   else if(p.action==='delete'){assert(row.status==='CANCELLED','취소한 예약만 목록에서 삭제할 수 있습니다.');statements.push(sql("UPDATE bookings SET status='DELETED' WHERE id=? AND status='CANCELLED' AND "+g.query,row.id,...g.args))}
   else if(p.action==='photos'){assert(['APPROVED','OVERRIDE'].includes(row.status),'활성 예약만 사진 상태를 변경할 수 있습니다.');assert(typeof p.sent==='boolean','사진 제출 상태를 확인해주세요.');statements.push(sql(`UPDATE bookings SET entry_photo=?,exit_photo=? WHERE id=? AND status IN ('APPROVED','OVERRIDE') AND ${g.query} RETURNING id`,p.sent?1:0,p.sent?1:0,row.id,...g.args))}
   else if(['entry','exit'].includes(p.action)){assert(['APPROVED','OVERRIDE'].includes(row.status),'활성 예약만 사진 상태를 변경할 수 있습니다.');statements.push(sql(`UPDATE bookings SET ${p.action==='entry'?'entry_photo':'exit_photo'}=? WHERE id=? AND status IN ('APPROVED','OVERRIDE') AND ${g.query}`,p.sent===true?1:0,row.id,...g.args))}
   else if(p.action==='penalty'){const period=await first('SELECT start_date FROM penalty_periods WHERE club_id=?',row.club_id);assert(!period||row.date>=period.start_date,'이전 학기의 사진 벌점은 이미 마감했습니다.');assert(['APPROVED','OVERRIDE'].includes(row.status),'활성 예약만 벌점을 적용할 수 있습니다.');assert(!row.entry_photo||!row.exit_photo,'입·퇴실 사진이 모두 확인된 예약입니다.');assert(row.date<today()||(row.date===today()&&row.end<=minuteNow()),'이용 종료 후 사진 미제출 벌점을 적용하세요.');statements.push(photoPenaltyStatement(sql,{clubId:row.club_id,date:row.date,content:await privateData.seal('장소대여 입·퇴실 사진 미제출'),points:10,guard:await adminGuard()}))}
   else throw new Error('지원하지 않는 예약 작업입니다.');const changed=await db.batch([...statements,auditChanged('BOOKING_'+p.action.toUpperCase(),row.id)]);await requireAdmin();if(p.action==='photos'&&!changed[0].results.length)throw failure('예약 상태가 변경되어 사진 상태를 저장하지 않았습니다. 목록을 새로고침해주세요.',409);return json({ok:true});
  }
  if(op==='penalties'&&req.method==='GET'){
   const from=validDate(url.searchParams.get('from'),true),to=validDate(url.searchParams.get('to'),true);assert(from<=to,'조회 기간을 확인하세요.');const result=await db.batch([sql('SELECT p.*,c.name AS club,c.room AS club_room FROM penalty_records p JOIN clubs c ON c.id=p.club_id WHERE p.reset_id IS NULL AND p.date BETWEEN ? AND ? ORDER BY p.date DESC,p.created_at DESC LIMIT 1001',from,to),sql('SELECT c.id,c.name,c.room,c.active,COUNT(p.id) AS count,COALESCE(SUM(p.points),0) AS points FROM clubs c LEFT JOIN penalty_records p ON p.club_id=c.id AND p.voided=0 AND p.reset_id IS NULL AND p.date BETWEEN ? AND ? GROUP BY c.id ORDER BY points DESC,c.name',from,to)]);return json({penalties:await Promise.all(result[0].results.slice(0,1000).map(row=>privateData.penalty(row))),truncated:result[0].results.length>1000,stats:result[1].results});
  }
  if(op==='savePenalty'&&req.method==='POST'){
   const date=validDate(p.date,true),content=field(p.content,'벌점 사항',500);assert(date<=today(),'벌점 날짜는 오늘 또는 지난 날짜로 입력하세요.');const points=Number(p.points);assert(Number.isInteger(points)&&points>0&&points<=1000,'벌점은 1~1000의 정수로 입력하세요.');const clubId=String(p.clubId||'');assert(await first('SELECT id FROM clubs WHERE id=?',clubId),'동아리를 선택하세요.');const period=await first('SELECT start_date FROM penalty_periods WHERE club_id=?',clubId);assert(!period||date>=period.start_date,'이미 마감한 학기의 날짜에는 벌점을 추가할 수 없습니다.');const kind=p.kind===undefined?'inspection':p.kind;assert(['inspection','photo'].includes(kind),'벌점 종류를 확인해주세요.');const id=crypto.randomUUID(),guard=await adminGuard();
   const change=kind==='photo'?photoPenaltyStatement(sql,{clubId,date,content:await privateData.seal(content),points,guard}):sql(`INSERT INTO penalties(id,club_id,date,content,points,kind,source_key,voided,created_at) SELECT ?,?,?,?,?,'inspection',NULL,0,? WHERE ${guard.query} RETURNING id`,id,clubId,date,await privateData.seal(content),points,new Date().toISOString(),...guard.args);
   const result=await db.batch([change,auditChanged('ADD_PENALTY',clubId+' '+date+' '+kind)]);
   if(!result[0].results.length){await requireAdmin();throw failure('이 날짜에 사진 미제출 벌점이 이미 있거나 이전 학기에 마감되었습니다. 기존 내역을 확인해주세요.',409)}return json({ok:true,id:result[0].results[0].id,kind});
  }
  if(op==='voidPenalty'&&req.method==='POST'){const id=String(p.id);assert(await first('SELECT id FROM penalty_records WHERE id=? AND reset_id IS NULL',id),'현재 학기의 벌점 기록을 찾을 수 없습니다. 마감한 기록은 수정할 수 없습니다.');const g=await adminGuard();await db.batch([sql('UPDATE penalties SET voided=1 WHERE id=? AND NOT EXISTS(SELECT 1 FROM penalty_closures pc WHERE pc.penalty_id=penalties.id) AND '+g.query,id,...g.args),auditChanged('VOID_PENALTY',id)]);await requireAdmin();return json({ok:true})}
  if(op==='export'&&req.method==='GET'){
   const from=validDate(url.searchParams.get('from'),true),to=validDate(url.searchParams.get('to'),true);assert(from<=to,'조회 기간을 확인하세요.');const rows=await Promise.all((await all(bookingSelect+' WHERE b.date BETWEEN ? AND ? ORDER BY b.date,b.start',from,to)).map(row=>privateData.booking(row)));await requireAdmin();const values=[['예약번호','날짜','장소','시작','종료','동아리','동아리방','대표자','전화번호','상태','입실사진','퇴실사진','추가승인 사유','메모'],...rows.map(b=>[b.id,b.date,b.room,hm(b.start),hm(b.end),b.club,b.club_room,b.representative,b.phone,b.status,b.entry_photo?'제출':'미확인',b.exit_photo?'제출':'미확인',b.reason,b.note])];return new Response('\uFEFF'+values.map(r=>r.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="bookings.csv"','Cache-Control':'no-store'}});
  }
  return json({error:'요청한 기능을 찾을 수 없습니다.'},404);
 }catch(e){const text=String(e.message||e);let message=text;const known=[['ROOM_CLOSED','아직 예약 오픈 전입니다. 날짜와 장소를 확인하세요.'],['BOOKING_OVERLAP','다른 예약이 먼저 등록되었습니다. 최신 시간표에서 다시 선택하세요.'],['CLUB_LIMIT','금요일·주말·공휴일은 동아리별 하루 총 4시간까지 예약할 수 있습니다.'],['CLOSE_BUSY','예약이 있는 날짜·장소는 마감할 수 없습니다. 일괄 변경을 모두 취소했습니다.'],['INVALID_TIME','선택한 시간 범위가 올바르지 않습니다.'],['INSPECTION_REQUIRED','동방점검 참석 동의가 필요합니다.']];for(const [code,label]of known)if(text.includes(code))message=label;if(/UNIQUE constraint/.test(text))message='이미 등록된 이름 또는 요청입니다. 최신 목록을 확인하세요.';if(/FOREIGN KEY|no such table|D1_ERROR/.test(message)&&message===text)message='저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';const internal=/SQLITE|D1_ERROR|FOREIGN KEY|no such table|syntax error/i.test(String(e.code||'')+' '+text)||e instanceof TypeError||['OperationError','DataError'].includes(e.name);const unique=/UNIQUE constraint/.test(text);if(internal&&!unique){message='저장 또는 조회 중 오류가 발생했습니다. 같은 내용으로 잠시 후 다시 시도해주세요.'}if(unique)message='이미 등록된 동아리 또는 사용 중인 아이디입니다. 목록을 새로고침해주세요.';return json({error:message,...(e.scope?{scope:e.scope}:{})},e.status||(internal&&!unique?500:unique?409:400))}
}
