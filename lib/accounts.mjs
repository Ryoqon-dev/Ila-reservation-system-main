import {credentials, assert, today, minuteNow} from './rules.mjs';
import {random, hash, passwordHash, hmac, equal, json, failure} from './security.mjs';

const COOKIE = '__Host-ila_club';
const MAX_AGE = 8 * 3600;
export const RENTAL_BUSY = '장소 대여 메뉴는 한 명만 입장 가능합니다.';
const LEASE_MS = 180000;
const publicAccount = row => row ? ({id:row.id, clubId:row.club_id, club:row.club_name, room:row.club_room, username:row.username, status:row.status}) : null;
const cookie = (value, age = MAX_AGE) => `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
const usernameKey = value => typeof value === 'string' ? value.toLowerCase() : '';

export function clubAccounts(req, db, config, helpers) {
  const {sql, first, all, audit, auditChanged, isAdmin, requireAdmin, adminGuard, requireProof, privateData, throttle, now} = helpers;
  const token = (req.headers.get('cookie') || '').match(/(?:^|;\s*)__Host-ila_club=([a-f0-9]{64})(?:;|$)/)?.[1];
  let sessionPromise;
  const session = () => sessionPromise ||= (async () => token ? first(`SELECT a.*,s.token AS login_token,c.name AS club_name,c.room AS club_room FROM club_sessions s JOIN club_accounts a ON a.id=s.account_id JOIN clubs c ON c.id=a.club_id WHERE s.token=? AND s.expires>? AND s.version=a.version AND a.status<>'SUSPENDED' AND c.active=1`, await hash(token), now) : null)();
  const requireSession = async (approved = true) => {
    const row = await session();
    if (!row) throw failure('동아리 로그인이 만료되었습니다. 다시 로그인해주세요.', 401, 'club');
    if (approved && row.status !== 'APPROVED') throw failure('관리자 승인 후 예약할 수 있습니다.', 403, 'club');
    return row;
  };
  // Every write rechecks both the session version and, for rental writes, the lease.
  const currentGuard = row => ({query:`EXISTS(SELECT 1 FROM club_sessions cs JOIN club_accounts ca ON ca.id=cs.account_id JOIN clubs cc ON cc.id=ca.club_id WHERE ca.id=? AND cs.token=? AND cs.expires>? AND cs.version=ca.version AND ca.status<>'SUSPENDED' AND cc.active=1)`, args:[row.id, row.login_token, Date.now()]});
  const guard = row => {const g=currentGuard(row);return {query:`(${g.query} AND EXISTS(SELECT 1 FROM club_accounts WHERE id=? AND status='APPROVED'))`,args:[...g.args,row.id]}};
  const rentalGuard = row => {const g=guard(row);return {query:`(${g.query} AND EXISTS(SELECT 1 FROM club_rental_leases WHERE account_id=? AND token=? AND expires>?))`,args:[...g.args,row.id,row.login_token,Date.now()]}};
  async function requireRental() {
    const row=await requireSession(),current=guard(row);
    if(!await first('SELECT 1 AS ok WHERE '+current.query,...current.args))throw failure('동아리 로그인이 만료되었습니다. 다시 로그인해주세요.',401,'club');
    const g=rentalGuard(row);
    if(!await first('SELECT 1 AS ok WHERE '+g.query,...g.args))throw failure(RENTAL_BUSY,423,'rental');
    return row;
  }
  async function profile(row) {
    if(!row)return null;
    const g=rentalGuard(row);
    return {...publicAccount(row),rentalAccess:!!await first('SELECT 1 AS ok WHERE '+g.query,...g.args)};
  }
  // A visible page sends a heartbeat each minute. Other sessions never renew its owner.
  function leaseStatement(accountId, stamp) {
    return sql(`INSERT INTO club_rental_leases(account_id,token,expires)
      SELECT ca.id,cs.token,MIN(cs.last_seen+?,cs.expires) FROM club_sessions cs JOIN club_accounts ca ON ca.id=cs.account_id JOIN clubs cc ON cc.id=ca.club_id
      WHERE ca.id=? AND ca.status='APPROVED' AND cc.active=1 AND cs.version=ca.version AND cs.expires>? AND cs.last_seen>?
      ORDER BY cs.rowid LIMIT 1
      ON CONFLICT(account_id) DO UPDATE SET token=excluded.token,expires=excluded.expires
      WHERE club_rental_leases.expires<=? OR NOT EXISTS(SELECT 1 FROM club_sessions live JOIN club_accounts a ON a.id=live.account_id WHERE live.token=club_rental_leases.token AND live.expires>? AND live.version=a.version AND a.status='APPROVED')`, LEASE_MS,accountId,stamp,stamp-LEASE_MS,stamp,stamp);
  }
  // Independent derived encryption key and secret pepper; no new deployment secret required.
  const accountHash = async (password, salt) => passwordHash(await hmac(config.bookingKey, 'ila-club-password-pepper-v1:' + password), salt);
  async function passwordFields(password) {
    credentials('valid-name', password);
    const salt = random();
    return {salt, hashed:await accountHash(password, salt), cipher:''};
  }
  async function handle(op, p, method) {
    if (op === 'registrationClubs' && method === 'GET') return json({clubs:await all(`SELECT c.id,c.name FROM clubs c WHERE c.active=1 AND NOT EXISTS(SELECT 1 FROM club_accounts a WHERE a.club_id=c.id) ORDER BY c.name`)});
    if (op === 'clubSession' && method === 'GET') {
      const row = await session();
      if (token && !row) throw failure('접속이 만료되었습니다. 다시 로그인해주세요.', 401, 'club');
      return json({club:await profile(row)});
    }
    if (op === 'clubHeartbeat' && method === 'POST') {
      const row=await requireSession(false),g=currentGuard(row),stamp=Date.now();
      await db.batch([
        sql(`UPDATE club_sessions SET last_seen=? WHERE token=? AND ${g.query}`,stamp,row.login_token,...g.args),
        sql(`UPDATE club_rental_leases SET expires=? WHERE account_id=? AND token=? AND expires>? AND ${g.query}`,stamp+LEASE_MS,row.id,row.login_token,stamp,...g.args),
        leaseStatement(row.id,stamp)
      ]);
      if(!await first('SELECT 1 AS ok WHERE '+g.query,...g.args))throw failure('접속이 만료되었습니다. 다시 로그인해주세요.',401,'club');
      return json({club:await profile(row)});
    }
    if (op === 'clubSignup' && method === 'POST') {
      await throttle('club-signup', 60);
      const c = credentials(p.username, p.password), clubId = String(p.clubId || '');
      assert(await first('SELECT id FROM clubs WHERE id=? AND active=1', clubId), '가입할 동아리를 선택해주세요. 목록에 없으면 지원부에 문의해주세요.');
      const fields = await passwordFields(c.password), id = crypto.randomUUID(), stamp = new Date().toISOString();
      try {
        const result = await db.batch([sql(`INSERT INTO club_accounts(id,club_id,username,username_key,password_hash,salt,password_cipher,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,'PENDING',?,? WHERE EXISTS(SELECT 1 FROM clubs WHERE id=? AND active=1) RETURNING id`, id, clubId, c.username, usernameKey(c.username), fields.hashed, fields.salt, fields.cipher, stamp, stamp, clubId), auditChanged('CLUB_SIGNUP', id)]);
        assert(result[0].results.length === 1, '가입할 동아리가 비활성화되었습니다.');
      } catch (error) {
        if (/UNIQUE constraint/.test(String(error))) throw failure('이미 계정이 있는 동아리이거나 사용 중인 아이디입니다. 지원부에 문의하거나 다른 아이디를 입력해주세요.', 409);
        throw error;
      }
      return json({ok:true, status:'PENDING'}, 201);
    }
    if (op === 'clubLogin' && method === 'POST') {
      await throttle('club-login-ip', 300);
      const key = usernameKey(typeof p.username === 'string' ? p.username.slice(0, 40) : '');
      const attempt = await throttle('club-login-' + await hash(key), 10);
      const row = await first(`SELECT a.*,c.name AS club_name,c.room AS club_room,c.active AS club_active FROM club_accounts a JOIN clubs c ON c.id=a.club_id WHERE a.username_key=?`, key);
      const password = typeof p.password === 'string' ? p.password.slice(0, 129) : '';
      const computed = await accountHash(password, row?.salt || '0'.repeat(64));
      if (!row || !equal(computed, row.password_hash) || row.status === 'SUSPENDED' || !row.club_active) throw failure('아이디·비밀번호를 확인하거나 계정 상태를 지원부에 문의해주세요.', 401, 'club');
      const value = random(), hashed = await hash(value);
      const stamp=Date.now();
      const result = await db.batch([
        sql('DELETE FROM club_sessions WHERE expires<=? OR NOT EXISTS(SELECT 1 FROM club_accounts a WHERE a.id=club_sessions.account_id AND a.version=club_sessions.version)',stamp),
        sql(`INSERT INTO club_sessions(token,account_id,version,expires,created_at,last_seen) SELECT ?,id,version,?,?,? FROM club_accounts WHERE id=? AND version=? AND password_hash=? AND status<>'SUSPENDED' AND EXISTS(SELECT 1 FROM clubs WHERE id=club_accounts.club_id AND active=1) RETURNING token`,hashed,stamp+MAX_AGE*1000,stamp,stamp,row.id,row.version,row.password_hash),
        auditChanged('CLUB_LOGIN', row.id),
        sql('DELETE FROM club_sessions WHERE token=? AND account_id=? AND EXISTS(SELECT 1 FROM club_sessions fresh WHERE fresh.token=?)',token?await hash(token):'',row.id,hashed),
        leaseStatement(row.id,stamp),
        sql('DELETE FROM attempts WHERE key=?', attempt)
      ]);
      if (!result[1].results.length) throw failure('계정 정보가 변경되었습니다. 새 정보로 로그인해주세요.', 409, 'club');
      return json({ok:true, club:await profile({...row,login_token:hashed})}, 200, {'Set-Cookie':cookie(value)});
    }
    if (op === 'clubLogout' && method === 'POST') {
      if (token) await sql('DELETE FROM club_sessions WHERE token=?', await hash(token)).run();
      return json({ok:true}, 200, {'Set-Cookie':cookie('', 0)});
    }
    if (op === 'clubCredentials' && method === 'POST') {
      const row = await requireSession(false);
      await throttle('club-credentials-' + row.id, 10);
      assert(typeof p.currentPassword === 'string' && p.currentPassword.length <= 128, '현재 비밀번호를 입력해주세요.');
      if (!equal(await accountHash(p.currentPassword, row.salt), row.password_hash)) throw failure('현재 비밀번호가 올바르지 않습니다.', 403, 'club');
      const c = credentials(p.username, p.password || p.currentPassword);
      const fields = p.password ? await passwordFields(c.password) : {hashed:row.password_hash, salt:row.salt, cipher:row.password_cipher};
      const g = currentGuard(row);
      const result = await db.batch([sql(`UPDATE club_accounts SET username=?,username_key=?,password_hash=?,salt=?,password_cipher=?,version=version+1,session_token=NULL,session_expires=0,updated_at=? WHERE id=? AND version=? AND ${g.query} RETURNING id`, c.username, usernameKey(c.username), fields.hashed, fields.salt, fields.cipher, new Date().toISOString(), row.id, row.version, ...g.args), auditChanged('CLUB_CHANGE_CREDENTIALS', row.id)]);
      if (!result[0].results.length) throw failure('접속 또는 계정 정보가 변경되었습니다. 다시 로그인해주세요.', 401, 'club');
      return json({ok:true}, 200, {'Set-Cookie':cookie('', 0)});
    }
    if (op === 'myClub' && method === 'GET') {
      const row = await requireSession(), g = guard(row);
      const page = Number(p.page || 0), bookingPage = Number(p.bookingPage || 0), kind = p.kind || 'all';
      assert(Number.isInteger(page) && page >= 0 && page <= 10000, '조회 페이지를 확인해주세요.');
      assert(Number.isInteger(bookingPage) && bookingPage >= 0 && bookingPage <= 10000, '예약 조회 페이지를 확인해주세요.');
      assert(['all','photo','inspection'].includes(kind), '벌점 종류를 확인해주세요.');
      const date = today(), minute = minuteNow();
      const result = await db.batch([
        sql(`SELECT kind,COUNT(*) AS count,COALESCE(SUM(points),0) AS points FROM penalty_records WHERE club_id=? AND voided=0 AND reset_id IS NULL AND ${g.query} GROUP BY kind`, row.club_id, ...g.args),
        sql(`SELECT id,date,content,points,kind FROM penalty_records WHERE club_id=? AND voided=0 AND reset_id IS NULL AND (?='all' OR kind=?) AND ${g.query} ORDER BY date DESC,created_at DESC,id DESC LIMIT 31 OFFSET ?`, row.club_id, kind, kind, ...g.args, page * 30),
        sql(`SELECT id,date,room,start,end,status,entry_photo,exit_photo FROM bookings WHERE club_id=? AND status IN ('APPROVED','OVERRIDE') AND (date>? OR (date=? AND end>?)) AND ${g.query} ORDER BY date,start,id LIMIT 1`, row.club_id, date, date, minute, ...g.args),
        sql(`SELECT id,date,room,start,end,status FROM bookings WHERE club_id=? AND status<>'DELETED' AND ${g.query} ORDER BY date,start,id LIMIT 31 OFFSET ?`, row.club_id, ...g.args, bookingPage * 30)
      ]);
      // Do not return a partial/empty report if a login was revoked during the read.
      if (!await first(`SELECT 1 AS ok WHERE ${g.query}`, ...g.args)) throw failure('접속이 만료되었습니다. 다시 로그인해주세요.',401,'club');
      const stats = {photo:{count:0,points:0},inspection:{count:0,points:0}};
      for (const item of result[0].results) if (Object.hasOwn(stats,item.kind)) stats[item.kind]={count:item.count,points:item.points};
      return json({stats,totalPoints:stats.photo.points+stats.inspection.points,penalties:await Promise.all(result[1].results.slice(0,30).map(row=>privateData.penalty(row))),more:result[1].results.length>30,page,kind,nextBooking:result[2].results[0]||null,bookings:result[3].results.slice(0,30),bookingsMore:result[3].results.length>30,bookingPage,serverDate:date,serverMinute:minute});
    }
    if (op === 'myBookings' && method === 'GET') {
      const row = await requireRental(), g = rentalGuard(row);
      const page = Math.max(0, Math.min(10000, Number(p.page) || 0));
      assert(Number.isInteger(page), '조회 페이지를 확인해주세요.');
      const rows = await all(`SELECT b.id,b.date,b.room,b.start,b.end,b.status,b.representative,b.phone,c.name AS club FROM bookings b JOIN clubs c ON c.id=b.club_id WHERE b.club_id=? AND b.status<>'DELETED' AND ${g.query} ORDER BY b.date DESC,b.start DESC,b.id DESC LIMIT 31 OFFSET ?`, row.club_id, ...g.args, page * 30);
      return json({bookings:await Promise.all(rows.slice(0,30).map(row=>privateData.booking(row))), more:rows.length > 30, page});
    }
    if (op === 'accountSave' && method === 'POST') {
      await requireAdmin();
      if(p.password)await requireProof(p.adminPassword,p.code);
      const existing = p.id ? await first('SELECT * FROM club_accounts WHERE id=?', String(p.id)) : null;
      assert(!p.id || existing, '계정을 찾을 수 없습니다.');
      const clubId = existing?.club_id || String(p.clubId || '');
      assert(!existing || !p.clubId || p.clubId === existing.club_id, '계정의 소속 동아리는 변경할 수 없습니다.');
      assert(await first('SELECT id FROM clubs WHERE id=?', clubId), '동아리를 찾을 수 없습니다.');
      const c = credentials(p.username, p.password || (existing ? 'unchanged-placeholder' : ''));
      const fields = p.password ? await passwordFields(c.password) : {hashed:existing.password_hash, salt:existing.salt, cipher:existing.password_cipher};
      const status = p.status || existing?.status || 'APPROVED';
      assert(['PENDING','APPROVED','SUSPENDED'].includes(status), '계정 상태를 확인해주세요.');
      const id = existing?.id || crypto.randomUUID(), stamp = new Date().toISOString();
      await requireAdmin();const g=await adminGuard();
      const change = existing ? sql(`UPDATE club_accounts SET username=?,username_key=?,password_hash=?,salt=?,password_cipher=?,status=?,approved_at=CASE WHEN ?='APPROVED' THEN COALESCE(approved_at,?) ELSE approved_at END,version=version+1,session_token=NULL,session_expires=0,updated_at=? WHERE id=? AND version=? AND ${g.query} RETURNING id`, c.username, usernameKey(c.username), fields.hashed, fields.salt, fields.cipher, status, status, stamp, stamp, id, existing.version, ...g.args) : sql(`INSERT INTO club_accounts(id,club_id,username,username_key,password_hash,salt,password_cipher,status,created_at,updated_at,approved_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${g.query} RETURNING id`, id, clubId, c.username, usernameKey(c.username), fields.hashed, fields.salt, fields.cipher, status, stamp, stamp, status === 'APPROVED' ? stamp : null, ...g.args);
      const result = await db.batch([change, auditChanged('ADMIN_SAVE_ACCOUNT', id)]);
      if (!result[0].results.length) throw failure('다른 곳에서 계정이 수정되었습니다. 목록을 새로고침해주세요.', 409);
      return json({ok:true, id});
    }
    if (op === 'accountDelete' && method === 'POST') {
      await requireAdmin();
      await requireProof(p.adminPassword,p.code);const g=await adminGuard();const result = await db.batch([sql('DELETE FROM club_accounts WHERE id=? AND '+g.query+' RETURNING id', String(p.id),...g.args), auditChanged('ADMIN_DELETE_ACCOUNT', String(p.id))]);
      assert(result[0].results.length === 1, '계정을 찾을 수 없습니다.');
      return json({ok:true});
    }
    if (op === 'accountSecret') {await requireAdmin();throw failure('계정 비밀번호 원문 조회는 보안상 제공하지 않습니다. 계정 수정에서 새 비밀번호를 설정해주세요.',410);}
    return null;
  }
  return {handle, session, requireApproved:() => requireSession(true), requireRental, rentalGuard, guard, publicAccount};
}
