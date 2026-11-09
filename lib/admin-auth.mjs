import {random,hash,hmac,passwordHash,crypt,equal,json,failure} from './security.mjs';
import {assert} from './common/input.mjs';
import {credentials} from './modules/accounts/credentials.mjs';
import {newTotpSecret,verifyTotp,authenticatorUri} from './totp.mjs';
import {ADMIN_IDLE_MINUTES,ADMIN_IDLE_MS} from './admin-session-policy.mjs';
export {ADMIN_IDLE_MS} from './admin-session-policy.mjs';
const MAX_AGE=8*3600,CHALLENGE_MS=5*60000;
const cookie=(value,age=MAX_AGE)=>`__Host-ila_admin=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
export function adminAuth(req,db,config,{sql,first,all,throttle,auditChanged}){
 const token=(req.headers.get('cookie')||'').match(/(?:^|;\s*)__Host-ila_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
 const tokenHash=()=>token?hash(token):Promise.resolve('');
 const mfaKey=()=>{if(!/^[a-f0-9]{64}$/.test(config.mfaKey||''))throw failure('관리자 인증 키가 없습니다. 보안 업데이트를 완료해주세요.',503);return config.mfaKey};
 const guard=async()=>({query:'EXISTS(SELECT 1 FROM sessions ads JOIN admin_session_security ass ON ass.token=ads.token WHERE ads.token=? AND ads.expires>? AND ass.verified=1 AND ass.last_activity>?)',args:[await tokenHash(),Date.now(),Date.now()-ADMIN_IDLE_MS]});
 const live=async()=>{const g=await guard();return first('SELECT s.expires,x.last_activity FROM sessions s JOIN admin_session_security x ON x.token=s.token WHERE s.token=? AND '+g.query,await tokenHash(),...g.args)};
 const isAdmin=async()=>!!await live();
 async function requireAdmin(){if(!await isAdmin())throw failure('관리자 로그인이 만료되었거나 2차 인증이 필요합니다. 다시 로그인해주세요.',401,'admin')}
 const hashedPassword=async(password,salt)=>'v2:'+await passwordHash(await hmac(config.bookingKey,'ila-admin-password-v2:'+password),salt);
 async function checkPassword(password,user){if(typeof password!=='string'||password.length>128||!user)return false;const computed=user.password_hash.startsWith('v2:')?await hashedPassword(password,user.salt):await passwordHash(password,user.salt);return equal(computed,user.password_hash)}
 const recoveryHash=code=>hmac(mfaKey(),'ila-admin-recovery-v1:'+String(code||'').replace(/[-\s]/g,'').toLowerCase());
 function newRecoveryCodes(){return Array.from({length:10},()=>random().slice(0,20).match(/.{5}/g).join('-'))}
 async function recoveryStatements(codes,gate,args){return Promise.all(codes.map(async code=>sql('INSERT INTO admin_recovery_codes SELECT ?,? WHERE '+gate,await recoveryHash(code),new Date().toISOString(),...args)))}
 async function proofPlan(code){
  const security=await first('SELECT * FROM admin_security WHERE id=1');if(!security)throw failure('인증앱 등록이 필요합니다.',403,'admin');
  const otp=typeof code==='string'?code.replace(/\s/g,''):'';
  const step=await verifyTotp(await crypt(security.secret,mfaKey(),true),otp,security.last_step);
  if(step!==null)return {security,step};
  if(/^(?:[a-f0-9]{5}-){3}[a-f0-9]{5}$|^[a-f0-9]{20}$/i.test(otp)){const codeHash=await recoveryHash(otp);if(await first('SELECT code_hash FROM admin_recovery_codes WHERE code_hash=?',codeHash))return {security,codeHash};}
  throw failure('인증 코드가 올바르지 않거나 이미 사용되었습니다. 인증앱의 다음 코드 또는 남은 복구 코드를 입력해주세요.',403,'mfa');
 }
 function proofMutations(proof,revision,gate,args){
  const changes=[];
  if(proof.codeHash){changes.push(sql('DELETE FROM admin_recovery_codes WHERE code_hash=? AND '+gate+' RETURNING code_hash',proof.codeHash,...args));changes.push(sql('UPDATE admin_security SET revision=? WHERE id=1 AND revision=? AND changes()>0 AND '+gate,revision,proof.security.revision,...args));}
  else changes.push(sql('UPDATE admin_security SET last_step=?,revision=? WHERE id=1 AND revision=? AND last_step<? AND '+gate+' RETURNING id',proof.step,revision,proof.security.revision,proof.step,...args));
  return changes;
 }
 async function requireProof(password,code){
  await requireAdmin();await throttle('admin-sensitive',10);await throttle('admin-sensitive-global',40,true);
  const user=await first('SELECT * FROM admins WHERE id=1');if(!await checkPassword(password,user))throw failure('관리자 비밀번호가 올바르지 않습니다.',403,'mfa');
  const proof=await proofPlan(code),g=await guard(),revision=crypto.randomUUID();
  const gate=g.query+' AND EXISTS(SELECT 1 FROM admins WHERE id=1 AND password_hash=?)',args=[...g.args,user.password_hash];
  await db.batch([...proofMutations(proof,revision,gate,args),sql('INSERT INTO admin_security_log SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM admin_security WHERE id=1 AND revision=?)',crypto.randomUUID(),'ADMIN_REAUTH',new Date().toISOString(),revision)]);
  if(!(await first('SELECT revision FROM admin_security WHERE id=1 AND revision=?',revision)))throw failure('접속 또는 인증 코드가 변경되었습니다. 다시 인증해주세요.',401,'admin');
  await requireAdmin();return {user,revision};
 }
 async function challenge(){return first('SELECT * FROM admin_challenges WHERE token=? AND expires>? AND attempts<5 AND password_hash=(SELECT password_hash FROM admins WHERE id=1)',await tokenHash(),Date.now())}
 async function challengePayload(row){if(!row)return {challenge:false};const setup=!!row.secret;if(!setup)return {challenge:true,enroll:false};const user=await first('SELECT username FROM admins WHERE id=1'),secret=await crypt(row.secret,mfaKey(),true);return {challenge:true,enroll:true,secret,uri:authenticatorUri(secret,user.username)}}
 async function handle(op,p,method){
  if(op==='auth'&&method==='GET'){const s=await live();return json({serverNow:Date.now(),initialized:!!await first('SELECT id FROM admins WHERE id=1'),admin:!!s,canSetup:!!config.bootstrapToken,idleExpiresAt:s?Math.min(s.expires,s.last_activity+ADMIN_IDLE_MS):null,...(!s?await challengePayload(await challenge()):{})})}
  if(op==='login'&&method==='POST'){
   await throttle('login',10);await throttle('admin-login-global',100,true);
   let user=await first('SELECT * FROM admins WHERE id=1');const pass=typeof p.password==='string'?p.password.slice(0,129):'';
   // Run a comparable derivation even for unknown users.
   const valid=user?await checkPassword(pass,user):(await passwordHash(pass,'0'.repeat(64)),false);
   if(!valid||user.username!==p.username)throw failure('아이디 또는 비밀번호가 올바르지 않습니다.',401);
   if(!user.password_hash.startsWith('v2:')){const upgraded=await hashedPassword(pass,user.salt);await sql('UPDATE admins SET password_hash=? WHERE id=1 AND password_hash=?',upgraded,user.password_hash).run();user=await first('SELECT * FROM admins WHERE id=1');if(user.password_hash!==upgraded||user.username!==p.username)throw failure('계정 정보가 변경되었습니다. 다시 로그인해주세요.',409)}
   const security=await first('SELECT id FROM admin_security WHERE id=1'),value=random(),id=await hash(value),secret=security?'':await crypt(newTotpSecret(),mfaKey());
   await db.batch([sql('DELETE FROM admin_challenges WHERE expires<=?',Date.now()),sql('DELETE FROM sessions WHERE expires<=? OR token IN (SELECT token FROM admin_session_security WHERE last_activity<=?)',Date.now(),Date.now()-ADMIN_IDLE_MS),sql('DELETE FROM admin_factor_changes WHERE expires<=?',Date.now()),sql('DELETE FROM admin_challenges WHERE token=?',await tokenHash()),sql('INSERT INTO admin_challenges(token,password_hash,secret,expires) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM admins WHERE id=1 AND password_hash=?)',id,user.password_hash,secret,Date.now()+CHALLENGE_MS,user.password_hash)]);
   return json(await challengePayload(await first('SELECT * FROM admin_challenges WHERE token=?',id)),200,{'Set-Cookie':cookie(value,CHALLENGE_MS/1000)});
  }
  if(op==='mfaVerify'&&method==='POST'){
   await throttle('admin-mfa',15);const c=await challenge();if(!c)throw failure('인증 시간이 지났습니다. 아이디와 비밀번호로 다시 로그인해주세요.',401,'admin');await throttle('admin-mfa-global',10,true);
   const count=await sql('UPDATE admin_challenges SET attempts=attempts+1 WHERE token=? AND expires>? AND attempts<5 RETURNING token',c.token,Date.now()).all();if(!count.results.length)throw failure('인증 시도 횟수를 초과했습니다. 다시 로그인해주세요.',401,'admin');
   const revision=crypto.randomUUID(),value=random(),id=await hash(value),stamp=Date.now(),codes=c.secret?newRecoveryCodes():null;
   const gate='EXISTS(SELECT 1 FROM admin_challenges WHERE token=? AND expires>? AND attempts<=5 AND password_hash=(SELECT password_hash FROM admins WHERE id=1))',args=[c.token,stamp],mutations=[];
   if(c.secret){const step=await verifyTotp(await crypt(c.secret,mfaKey(),true),p.code);if(step===null)throw failure('인증앱의 6자리 코드를 다시 확인해주세요.',403,'mfa');mutations.push(sql('INSERT INTO admin_security SELECT 1,?,?,? WHERE '+gate+' AND NOT EXISTS(SELECT 1 FROM admin_security WHERE id=1)',c.secret,step,revision,...args));}
   else mutations.push(...proofMutations(await proofPlan(p.code),revision,gate,args));
   const verified='EXISTS(SELECT 1 FROM admin_security WHERE id=1 AND revision=?) AND '+gate,verifiedArgs=[revision,...args];
   if(codes)mutations.push(...await recoveryStatements(codes,verified,verifiedArgs));
   mutations.push(sql('INSERT INTO sessions SELECT ?,? WHERE '+verified,id,stamp+MAX_AGE*1000,...verifiedArgs));
   mutations.push(sql('INSERT INTO admin_session_security SELECT ?,?,1 WHERE EXISTS(SELECT 1 FROM sessions WHERE token=?)',id,stamp,id));
   mutations.push(sql('DELETE FROM admin_challenges WHERE token=? AND EXISTS(SELECT 1 FROM sessions WHERE token=?)',c.token,id));
   mutations.push(sql('INSERT INTO audit SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE token=?)',crypto.randomUUID(),codes?'ADMIN_MFA_ENROLLED':'ADMIN_LOGIN','1',new Date().toISOString(),id));
   await db.batch(mutations);if(!await first('SELECT token FROM sessions WHERE token=?',id))throw failure('인증 정보가 변경되었습니다. 다시 로그인해주세요.',409,'mfa');
   return json({ok:true,admin:true,idleExpiresAt:stamp+ADMIN_IDLE_MS,...(codes?{recoveryCodes:codes}:{})},200,{'Set-Cookie':cookie(value)});
  }
  if(op==='logout'&&method==='POST'){await db.batch([sql('DELETE FROM sessions WHERE token=?',await tokenHash()),sql('DELETE FROM admin_challenges WHERE token=?',await tokenHash())]);return json({ok:true},200,{'Set-Cookie':cookie('',0)})}
  if(op==='adminActivity'&&method==='POST'){await requireAdmin();const g=await guard(),stamp=Date.now();const r=await sql('UPDATE admin_session_security SET last_activity=? WHERE token=? AND '+g.query+' RETURNING token',stamp,await tokenHash(),...g.args).all();if(!r.results.length)throw failure(`${ADMIN_IDLE_MINUTES}분 동안 사용하지 않아 로그아웃되었습니다.`,401,'admin');const liveSession=await live();return json({idleExpiresAt:Math.min(liveSession.expires,stamp+ADMIN_IDLE_MS)})}
  if(op==='credentials'&&method==='POST'){
   const {user,revision}=await requireProof(p.currentPassword,p.code),c=credentials(p.username,p.password),salt=random(),g=await guard(),nextHash=await hashedPassword(c.password,salt);
   const applied='EXISTS(SELECT 1 FROM admins WHERE id=1 AND password_hash=?) AND EXISTS(SELECT 1 FROM admin_security WHERE revision=?)';
   const result=await db.batch([sql('UPDATE admins SET username=?,password_hash=?,salt=? WHERE id=1 AND password_hash=? AND '+g.query+' AND EXISTS(SELECT 1 FROM admin_security WHERE revision=?) RETURNING id',c.username,nextHash,salt,user.password_hash,...g.args,revision),auditChanged('CHANGE_ADMIN','1'),sql('DELETE FROM sessions WHERE '+applied,nextHash,revision),sql('DELETE FROM admin_challenges WHERE '+applied,nextHash,revision)]);
   if(!result[0].results.length)throw failure('접속 또는 계정 정보가 변경되어 저장하지 않았습니다.',401,'admin');return json({ok:true},200,{'Set-Cookie':cookie('',0)});
  }
  if(op==='mfaStatus'&&method==='GET'){await requireAdmin();return json({enabled:true,recoveryCount:(await first('SELECT COUNT(*) AS n FROM admin_recovery_codes')).n,idleMinutes:ADMIN_IDLE_MINUTES})}
  if(op==='mfaRotateStart'&&method==='POST'){
   const {revision}=await requireProof(p.adminPassword,p.code),g=await guard(),secret=newTotpSecret(),id=crypto.randomUUID();
   await db.batch([sql('DELETE FROM admin_factor_changes WHERE owner=?',await tokenHash()),sql('INSERT INTO admin_factor_changes SELECT ?,?,?,?,? WHERE '+g.query+' AND EXISTS(SELECT 1 FROM admin_security WHERE revision=?)',id,await tokenHash(),await crypt(secret,mfaKey()),Date.now()+CHALLENGE_MS,revision,...g.args,revision)]);
   if(!await first('SELECT id FROM admin_factor_changes WHERE id=?',id))throw failure('접속이 변경되었습니다. 다시 로그인해주세요.',401,'admin');const user=await first('SELECT username FROM admins WHERE id=1');return json({id,secret,uri:authenticatorUri(secret,user.username)});
  }
  if(op==='mfaRotateComplete'&&method==='POST'){
   await requireAdmin();await throttle('admin-factor',10);const pending=await first('SELECT * FROM admin_factor_changes WHERE id=? AND owner=? AND expires>?',String(p.id),await tokenHash(),Date.now());assert(pending,'인증앱 변경 시간이 지났습니다. 처음부터 다시 진행해주세요.');
   const step=await verifyTotp(await crypt(pending.secret,mfaKey(),true),p.code);if(step===null)throw failure('새 인증앱의 코드를 확인해주세요.',403,'mfa');
   const codes=newRecoveryCodes(),g=await guard(),revision=crypto.randomUUID(),gate='EXISTS(SELECT 1 FROM admin_security WHERE id=1 AND revision=?)',args=[revision];
   const r=await db.batch([sql('UPDATE admin_security SET secret=?,last_step=?,revision=? WHERE id=1 AND revision=? AND '+g.query+' AND EXISTS(SELECT 1 FROM admin_factor_changes WHERE id=? AND expires>?) RETURNING id',pending.secret,step,revision,pending.revision,...g.args,pending.id,Date.now()),sql('DELETE FROM admin_recovery_codes WHERE '+gate,...args),...await recoveryStatements(codes,gate,args),sql('INSERT INTO audit SELECT ?,?,?,? WHERE '+gate,crypto.randomUUID(),'ADMIN_MFA_CHANGED','1',new Date().toISOString(),...args),sql('DELETE FROM admin_challenges WHERE '+gate,...args),sql('DELETE FROM sessions WHERE token<>? AND '+gate,await tokenHash(),...args)]);
   if(!r[0].results.length)throw failure('인증 정보가 변경되었습니다. 다시 진행해주세요.',409,'mfa');return json({ok:true,recoveryCodes:codes});
  }
  if(op==='mfaRecoveryReset'&&method==='POST'){
   const {revision:previous}=await requireProof(p.adminPassword,p.code),g=await guard(),codes=newRecoveryCodes(),revision=crypto.randomUUID(),gate=g.query+' AND EXISTS(SELECT 1 FROM admin_security WHERE revision=?)',args=[...g.args,revision];
   const result=await db.batch([sql('UPDATE admin_security SET revision=? WHERE id=1 AND revision=? AND '+g.query+' RETURNING id',revision,previous,...g.args),sql('DELETE FROM admin_recovery_codes WHERE '+gate,...args),...await recoveryStatements(codes,gate,args),sql('INSERT INTO audit SELECT ?,?,?,? WHERE '+gate,crypto.randomUUID(),'ADMIN_RECOVERY_RESET','1',new Date().toISOString(),...args)]);if(!result[0].results.length)throw failure('접속 또는 인증 정보가 변경되었습니다. 다시 진행해주세요.',409,'mfa');await requireAdmin();return json({recoveryCodes:codes});
  }
  return null;
 }
 return {handle,token,tokenHash,isAdmin,requireAdmin,adminGuard:guard,requireProof,checkPassword,hashedPassword};
}
