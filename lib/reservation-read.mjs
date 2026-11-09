import {random,hash,passwordHash,hmac,equal,json,failure} from './security.mjs';
import {assert,field,credentials,validDate,ROOMS,today} from './rules.mjs';
import {ADMIN_IDLE_MS} from './admin-session-policy.mjs';
import {parseOpeningTime,openingClock} from './opening-time.mjs';
import {bookingOrder} from './booking-order.mjs';
import {DAY_MS,READ_LINK_MAX_DAYS,READ_LINK_SESSION_MS} from './reservation-link-policy.mjs';
const HOUR=3600000,hex=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const cookie=(kind,value,seconds=8*3600)=>`__Host-ila_${kind}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${seconds}`;
export function reservationRead(req,db,config,{sql,all,first,requireAdmin,adminGuard,requireProof,auditChanged,throttle}){
 const token=kind=>(req.headers.get('cookie')||'').match(new RegExp('(?:^|;\\s*)__Host-ila_'+kind+'=([a-f0-9]{64})(?:;|$)'))?.[1];
 const secretHash=async(password,salt)=>passwordHash(await hmac(config.bookingKey,'ila-reservation-reader-v1:'+password),salt);
 const denied=(scope,redeeming=false)=>failure(scope==='share'?(redeeming?'조회 링크가 만료되거나 정지되었습니다. 관리자에게 새 링크를 요청해주세요.':'조회 접속이 종료되었습니다. 받은 링크를 다시 열어주세요.'):'조회 전용 로그인이 만료되었습니다. 다시 로그인해주세요.',401,scope);
 async function readerGuard(){return {query:`EXISTS(SELECT 1 FROM reservation_reader_sessions rs JOIN reservation_readers ra ON ra.id=rs.reader_id WHERE rs.token=? AND ra.active=1 AND rs.version=ra.version AND rs.expires>${openingClock} AND rs.last_activity>${openingClock}-?)`,args:[await hash(token('reader')||''),Date.now(),Date.now(),ADMIN_IDLE_MS]}}
 async function shareGuard(){return {query:`EXISTS(SELECT 1 FROM reservation_share_sessions ss JOIN reservation_share_links sl ON sl.id=ss.link_id WHERE ss.token=? AND ss.expires>${openingClock} AND sl.expires>${openingClock} AND sl.revoked=0)`,args:[await hash(token('share')||''),Date.now(),Date.now()]}}
 async function reader(){const g=await readerGuard(),row=await first('SELECT ra.id,ra.username,ra.name,ra.version,rs.expires,rs.last_activity FROM reservation_readers ra JOIN reservation_reader_sessions rs ON rs.reader_id=ra.id WHERE rs.token=? AND '+g.query,await hash(token('reader')||''),...g.args);if(!row)throw denied('reader');return {kind:'reader',name:row.name,username:row.username,idleExpiresAt:Math.min(row.expires,row.last_activity+ADMIN_IDLE_MS),serverNow:Date.now()}}
 async function share(){const g=await shareGuard(),row=await first('SELECT sl.id,sl.name,sl.date_from,sl.date_to,sl.rooms_json,sl.expires FROM reservation_share_links sl JOIN reservation_share_sessions ss ON ss.link_id=sl.id WHERE ss.token=? AND '+g.query,await hash(token('share')||''),...g.args);if(!row)throw denied('share');return {kind:'share',name:row.name,from:row.date_from,to:row.date_to,rooms:JSON.parse(row.rooms_json),expires:row.expires,serverNow:Date.now()}}
 async function actor(source){assert(['main','reader','share'].includes(source),'조회 경로를 확인해주세요.');if(source==='main'){await requireAdmin();return {kind:'main',name:'메인 관리자',serverNow:Date.now()}}return source==='reader'?reader():share()}
 const guard=source=>source==='main'?adminGuard():source==='reader'?readerGuard():shareGuard();
 function period(from,to,maxDays){validDate(from,true);validDate(to,true);assert(from<=to&&(Date.parse(to)-Date.parse(from))/DAY_MS<maxDays,`조회 기간은 최대 ${maxDays}일까지 선택해주세요.`);return {from,to}}
 async function handle(op,p,method){
  if(op==='readerLogin'&&method==='POST'){
   await throttle('reservation-reader-login',10);await throttle('reservation-reader-login-global',100,true);
   const username=typeof p.username==='string'?p.username:'',password=typeof p.password==='string'?p.password.slice(0,129):'';
   const row=await first('SELECT * FROM reservation_readers WHERE username=?',username),computed=await secretHash(password,row?.salt||'0'.repeat(64));
   if(!row||!row.active||password.length>128||!equal(computed,row.password_hash))throw failure('아이디 또는 비밀번호가 올바르지 않습니다.',401,'reader');
   const value=random(),id=await hash(value),now=Date.now();
   const result=await db.batch([sql('DELETE FROM reservation_reader_sessions WHERE expires<=? OR last_activity<=?',now,now-ADMIN_IDLE_MS),sql('INSERT INTO reservation_reader_sessions SELECT ?,id,version,?,? FROM reservation_readers WHERE id=? AND active=1 AND version=? AND password_hash=? RETURNING reader_id',id,now+8*HOUR,now,row.id,row.version,row.password_hash),auditChanged('READER_LOGIN',row.id),sql('DELETE FROM sessions WHERE token=? AND EXISTS(SELECT 1 FROM reservation_reader_sessions WHERE token=?)',await hash(token('admin')||''),id),sql('DELETE FROM admin_challenges WHERE token=? AND EXISTS(SELECT 1 FROM reservation_reader_sessions WHERE token=?)',await hash(token('admin')||''),id)]);
   if(!result[1].results.length)throw denied('reader');return json({ok:true},200,{'Set-Cookie':cookie('reader',value)});
  }
  if(op==='readerLogout'&&method==='POST'){await sql('DELETE FROM reservation_reader_sessions WHERE token=?',await hash(token('reader')||'')).run();return json({ok:true},200,{'Set-Cookie':cookie('reader','',0)})}
  if(op==='shareLogout'&&method==='POST'){await sql('DELETE FROM reservation_share_sessions WHERE token=?',await hash(token('share')||'')).run();return json({ok:true},200,{'Set-Cookie':cookie('share','',0)})}
  if(op==='readAuth'&&method==='GET'){assert(['reader','share'].includes(p.source),'조회 경로를 확인해주세요.');const value=await actor(p.source);return json({ok:true,...value,serverDate:today()})}
  if(op==='readerActivity'&&method==='POST'){
   await reader();const g=await readerGuard(),stamp=Date.now(),result=await sql('UPDATE reservation_reader_sessions SET last_activity=? WHERE token=? AND '+g.query+' RETURNING token',stamp,await hash(token('reader')||''),...g.args).all();
   if(!result.results.length)throw denied('reader');return json(await reader());
  }
  if(op==='shareRedeem'&&method==='POST'){
   assert(typeof p.token==='string'&&hex.test(p.token),'조회 링크가 올바르지 않습니다.');await throttle('reservation-share',60);
   const tokenHash=await hash(p.token),link=await first('SELECT id FROM reservation_share_links WHERE token_hash=? AND revoked=0 AND expires>?',tokenHash,Date.now());if(!link)throw denied('share',true);
   const raw=random(),id=await hash(raw),now=Date.now();
   const result=await db.batch([sql('DELETE FROM reservation_share_sessions WHERE expires<=?',now),sql(`INSERT INTO reservation_share_sessions SELECT ?,id,MIN(expires,?) FROM reservation_share_links WHERE id=? AND token_hash=? AND revoked=0 AND expires>${openingClock} RETURNING expires`,id,now+READ_LINK_SESSION_MS,link.id,tokenHash,now)]);
   const session=result[1].results[0];if(!session)throw denied('share',true);return json({ok:true},200,{'Set-Cookie':cookie('share',raw,Math.max(1,Math.ceil((session.expires-now)/1000)))});
  }
  if(['reservationRead','reservationTable'].includes(op)&&method==='GET'){
   const a=await actor(p.source),table=op==='reservationTable',from=table?p.date:(p.from||today()),to=table?p.date:(p.to||from);period(from,to,table?1:31);
   if(a.kind==='share'&&(from<a.from||to>a.to))throw failure('이 링크에서 허용된 날짜만 조회할 수 있습니다.',403,'share');
   const rooms=a.kind==='share'?a.rooms:ROOMS,sort=p.sort||'date-asc',order=bookingOrder(sort),page=table?0:Number(p.page||0);assert(Number.isInteger(page)&&page>=0&&page<=10000,'조회 페이지를 확인해주세요.');
   const g=await guard(p.source),condition=`b.date BETWEEN ? AND ? AND b.status ${table?"IN ('APPROVED','OVERRIDE')":"<>'DELETED'"} AND b.room IN (SELECT value FROM json_each(?)) AND ${g.query}`,args=[from,to,JSON.stringify(rooms),...g.args];
   const result=await db.batch([sql(`SELECT b.date,b.room,b.start,b.end,c.name AS club,b.status FROM bookings b JOIN clubs c ON c.id=b.club_id WHERE ${condition} ORDER BY ${order} LIMIT ? OFFSET ?`,...args,table?2001:100,table?0:page*100),sql(`SELECT COUNT(*) AS n FROM bookings b WHERE ${condition}`,...args)]);
   await actor(p.source);return json({bookings:result[0].results.slice(0,table?2000:100),total:result[1].results[0].n,page,more:!table&&result[1].results[0].n>(page+1)*100,truncated:table&&result[0].results.length>2000,from,to,rooms,serverNow:Date.now(),serverDate:today()});
  }
  if(op==='readAccess'&&method==='GET'){
   await requireAdmin();const readers=await all('SELECT id,username,name,active,version,created_at,updated_at FROM reservation_readers ORDER BY active DESC,username LIMIT 1000'),links=await all('SELECT id,name,date_from,date_to,rooms_json,expires,revoked,created_at FROM reservation_share_links ORDER BY revoked,(expires>?) DESC,created_at DESC,id LIMIT 100',Date.now());await requireAdmin();return json({readers,links:links.map(({rooms_json,...row})=>({...row,rooms:JSON.parse(rooms_json)})),serverNow:Date.now()});
  }
  if(op==='saveReader'&&method==='POST'){
   await requireAdmin();const name=field(p.name,'표시 이름',40),username=field(p.username,'아이디',40);assert(/^[a-zA-Z0-9_.-]{4,40}$/.test(username),'아이디는 영문·숫자·._- 4~40자로 입력하세요.');assert(typeof p.active==='boolean','계정 상태를 확인해주세요.');
   const hasId=p.id!==undefined;if(hasId)assert(typeof p.id==='string'&&uuid.test(p.id),'조회 계정 정보를 확인해주세요.');const old=hasId?await first('SELECT * FROM reservation_readers WHERE id=?',p.id):null;if(hasId)assert(old,'조회 계정을 찾을 수 없습니다.');if(old)assert(Number.isInteger(p.version)&&p.version===old.version,'다른 곳에서 계정이 변경되었습니다. 새로고침해주세요.');
   assert(!(await first('SELECT id FROM admins WHERE username=?',username)),'메인 관리자와 다른 아이디를 사용해주세요.');
   const password=p.password===undefined?'':p.password;assert(typeof password==='string','비밀번호를 확인해주세요.');if(!old||password)credentials(username,password);
   if(!old)assert((await first('SELECT COUNT(*) AS n FROM reservation_readers')).n<1000,'조회 계정은 최대 1,000개까지 관리할 수 있습니다.');
   await requireProof(p.adminPassword,p.code);const g=await adminGuard(),id=old?.id||crypto.randomUUID(),salt=password?random():old.salt,pw=password?await secretHash(password,salt):old.password_hash,stamp=new Date().toISOString(),version=(old?.version||0)+1;
   const change=old?sql(`UPDATE reservation_readers SET username=?,name=?,salt=?,password_hash=?,active=?,version=?,updated_at=? WHERE id=? AND version=? AND ${g.query} RETURNING id`,username,name,salt,pw,p.active?1:0,version,stamp,id,old.version,...g.args):sql(`INSERT INTO reservation_readers SELECT ?,?,?,?,?,?,1,?,? WHERE ${g.query} RETURNING id`,id,username,name,salt,pw,p.active?1:0,stamp,stamp,...g.args);
   const result=await db.batch([change,sql('DELETE FROM reservation_reader_sessions WHERE reader_id=? AND EXISTS(SELECT 1 FROM reservation_readers WHERE id=? AND version=? AND updated_at=?)',id,id,version,stamp),sql('INSERT INTO audit SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM reservation_readers WHERE id=? AND version=? AND updated_at=?)',crypto.randomUUID(),'SAVE_READER',id,stamp,id,version,stamp)]);
   if(!result[0].results.length){await requireAdmin();throw failure('계정이 변경되어 저장하지 않았습니다. 새로고침해주세요.',409)}return json({ok:true,id});
  }
  if(op==='createReadLink'&&method==='POST'){
   await requireAdmin();const name=field(p.name,'링크 이름',60);period(p.from,p.to,7);assert(Array.isArray(p.rooms)&&p.rooms.length&&p.rooms.every(room=>ROOMS.includes(room)),'조회할 장소를 선택해주세요.');const rooms=ROOMS.filter(room=>p.rooms.includes(room));
   const expires=parseOpeningTime(p.expiresAt),now=Date.now();assert(expires>now&&expires<=now+READ_LINK_MAX_DAYS*DAY_MS,`링크 만료는 현재 이후 최대 ${READ_LINK_MAX_DAYS}일 안으로 지정해주세요.`);assert(typeof p.requestKey==='string'&&uuid.test(p.requestKey),'발급 요청 정보를 확인해주세요.');
   if(await first('SELECT id FROM reservation_share_links WHERE id=?',p.requestKey))throw failure('이미 발급된 요청입니다. 기존 링크 목록을 확인해주세요.',409);
   await requireProof(p.adminPassword,p.code);const g=await adminGuard(),raw=random(),tokenHash=await hash(raw),stamp=new Date().toISOString();
   const result=await db.batch([sql(`INSERT INTO reservation_share_links SELECT ?,?,?,?,?,?,?,0,? WHERE ${g.query} AND ?>${openingClock} AND (SELECT COUNT(*) FROM reservation_share_links WHERE revoked=0 AND expires>?)<100 RETURNING id`,p.requestKey,tokenHash,name,p.from,p.to,JSON.stringify(rooms),expires,stamp,...g.args,expires,Date.now(),Date.now()),auditChanged('CREATE_READ_LINK',p.requestKey)]);
   if(!result[0].results.length){await requireAdmin();throw failure('만료 시각을 확인하거나 활성 링크를 정리한 뒤 다시 발급해주세요.',409)}return json({ok:true,id:p.requestKey,token:raw,expires,from:p.from,to:p.to,rooms});
  }
  if(op==='revokeReadLink'&&method==='POST'){
   await requireAdmin();assert(typeof p.id==='string'&&uuid.test(p.id),'조회 링크를 확인해주세요.');const g=await adminGuard();
   const result=await db.batch([sql('UPDATE reservation_share_links SET revoked=1 WHERE id=? AND revoked=0 AND '+g.query+' RETURNING id',p.id,...g.args),auditChanged('REVOKE_READ_LINK',p.id)]);if(!result[0].results.length){await requireAdmin();assert(await first('SELECT id FROM reservation_share_links WHERE id=? AND revoked=1',p.id),'조회 링크를 찾을 수 없습니다.')}return json({ok:true});
  }
  return null;
 }
 return {handle};
}
