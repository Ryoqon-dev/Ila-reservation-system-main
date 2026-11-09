import {ROOMS,dateRange,assert,today} from './rules.mjs';
import {json,failure} from './security.mjs';
import {parseOpeningTime,kstDate,openingClock} from './opening-time.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function scheduledOpenings(db,{sql,all,first,requireAdmin,adminGuard}){
 async function handle(op,p,method){
  if(!['scheduleOpenings','scheduledOpenings','cancelOpeningSchedule'].includes(op))return null;await requireAdmin();
  if(op==='scheduledOpenings'&&method==='GET'){
   const status=p.status||'pending',page=Number(p.page||0);assert(['pending','opened'].includes(status),'오픈 상태를 확인해주세요.');assert(Number.isInteger(page)&&page>=0&&page<=10000,'조회 페이지를 확인해주세요.');
   const futureTargets="EXISTS(SELECT 1 FROM opening_schedule_targets ft WHERE ft.batch_id=b.id AND ft.date>=?)";
   const counts=await first(`SELECT COALESCE(SUM(CASE WHEN opens_at>${openingClock} THEN 1 ELSE 0 END),0) AS pending,COALESCE(SUM(CASE WHEN opens_at<=${openingClock} THEN 1 ELSE 0 END),0) AS opened FROM opening_schedule_batches b WHERE status='ACTIVE' AND ${futureTargets}`,Date.now(),Date.now(),today());
   const rows=await all(`SELECT b.id,b.opens_at,b.created_at,json_group_array(json_object('date',t.date,'room',t.room)) AS targets_json FROM opening_schedule_batches b JOIN opening_schedule_targets t ON t.batch_id=b.id WHERE b.status='ACTIVE' AND b.opens_at ${status==='pending'?'>':'<='} ${openingClock} AND ${futureTargets} GROUP BY b.id ORDER BY b.opens_at,b.id LIMIT 31 OFFSET ?`,Date.now(),today(),page*30);
   await requireAdmin();return json({schedules:rows.slice(0,30).map(({targets_json,...row})=>({...row,targets:JSON.parse(targets_json).sort((a,b)=>a.date.localeCompare(b.date)||ROOMS.indexOf(a.room)-ROOMS.indexOf(b.room))})),counts,page,more:rows.length>30,serverNow:Date.now()});
  }
  if(op==='scheduleOpenings'&&method==='POST'){
   assert(typeof p.requestKey==='string'&&uuid.test(p.requestKey),'예약 오픈 요청 정보를 확인해주세요.');
   const dates=dateRange(p.from||'',p.to||'',Array.isArray(p.dates)?p.dates:[]);assert(Array.isArray(p.rooms)&&p.rooms.length&&p.rooms.every(room=>ROOMS.includes(room)),'장소를 선택하세요.');
   const rooms=ROOMS.filter(room=>p.rooms.includes(room)),targets=dates.flatMap(date=>rooms.map(room=>({date,room}))),canonical=JSON.stringify(targets),opensAt=parseOpeningTime(p.opensAt);
   assert(kstDate(opensAt)<=dates[0],'오픈 시각은 첫 대여 대상 날짜 또는 그 이전으로 지정해주세요.');
   const replay=async row=>{if(row.opens_at!==opensAt||row.targets_json!==canonical||row.status!=='ACTIVE'||(await first('SELECT COUNT(*) AS n FROM opening_schedule_targets WHERE batch_id=?',row.id)).n!==targets.length)throw failure('같은 요청의 대상이 변경되거나 취소되었습니다. 최신 목록을 확인하고 새로 설정해주세요.',409);await requireAdmin();return json({ok:true,id:row.id,count:targets.length,opensAt,alreadyApplied:true})};
   const existing=await first('SELECT * FROM opening_schedule_batches WHERE id=?',p.requestKey);if(existing)return replay(existing);assert(opensAt>Date.now(),'오픈 시각은 현재 한국시간보다 뒤로 지정해주세요.');
   const g=await adminGuard(),stamp=new Date().toISOString(),gate="EXISTS(SELECT 1 FROM opening_schedule_batches WHERE id=? AND status='ACTIVE' AND updated_at=?)",args=[p.requestKey,stamp];
   const claim=sql(`WITH targets AS (SELECT json_extract(value,'$.date') AS date,json_extract(value,'$.room') AS room FROM json_each(?))
    INSERT INTO opening_schedule_batches SELECT ?,?,?,'ACTIVE',?,? WHERE ${g.query} AND ?>${openingClock}
    AND NOT EXISTS(SELECT 1 FROM targets t JOIN openings o ON o.date=t.date AND o.room=t.room WHERE o.is_open=1)
    AND NOT EXISTS(SELECT 1 FROM targets t JOIN opening_schedule_targets st ON st.date=t.date AND st.room=t.room) RETURNING id`,canonical,p.requestKey,opensAt,canonical,stamp,stamp,...g.args,opensAt,Date.now());
   let result;try{result=await db.batch([claim,sql(`INSERT INTO opening_schedule_targets SELECT json_extract(value,'$.date'),json_extract(value,'$.room'),? FROM json_each(?) WHERE ${gate}`,p.requestKey,canonical,...args),sql('INSERT INTO audit SELECT ?,?,?,? WHERE '+gate,crypto.randomUUID(),'SCHEDULE_OPEN',p.requestKey,stamp,...args)])}catch(error){const duplicate=await first('SELECT * FROM opening_schedule_batches WHERE id=?',p.requestKey);if(duplicate)return replay(duplicate);throw error}
   if(!result[0].results.length){await requireAdmin();throw failure('이미 오픈했거나 자동 오픈 설정이 있는 날짜·장소가 포함되어 있습니다. 기존 상태는 유지했습니다. 대상과 오픈 시각을 다시 확인해주세요.',409)}
   return json({ok:true,id:p.requestKey,count:targets.length,opensAt});
  }
  if(op==='cancelOpeningSchedule'&&method==='POST'){
   assert(typeof p.id==='string'&&uuid.test(p.id),'취소할 자동 오픈 설정을 확인해주세요.');const g=await adminGuard(),stamp=new Date().toISOString();
   const result=await db.batch([sql(`UPDATE opening_schedule_batches SET status='CANCELLED',updated_at=? WHERE id=? AND status='ACTIVE' AND opens_at>${openingClock} AND ${g.query} RETURNING id`,stamp,p.id,Date.now(),...g.args),sql('INSERT INTO audit SELECT ?,?,?,? WHERE changes()>0',crypto.randomUUID(),'CANCEL_SCHEDULE_OPEN',p.id,stamp),sql(`DELETE FROM opening_schedule_targets WHERE batch_id=? AND EXISTS(SELECT 1 FROM opening_schedule_batches WHERE id=? AND status='CANCELLED' AND updated_at=?) AND ${g.query}`,p.id,p.id,stamp,...g.args)]);
   if(!result[0].results.length){await requireAdmin();const row=await first('SELECT status FROM opening_schedule_batches WHERE id=?',p.id);if(row?.status==='CANCELLED')return json({ok:true,alreadyCancelled:true});throw failure('이미 오픈 시각이 지났거나 설정이 변경되었습니다. 오픈 후에는 기존 오픈·마감 메뉴를 이용해주세요.',409)}
   return json({ok:true});
  }
  return null;
 }
 return {handle};
}
