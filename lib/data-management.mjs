import {assert,validDate,today,hm} from './rules.mjs';
import {json,failure} from './security.mjs';
import {DATASETS,EXPORT_COLUMNS} from './data-export.mjs';
import {dataMetrics,FREE_LIMITS,usageLevel} from './data-metrics.mjs';
const PAGE=200,BATCH=250;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function dataManagement(req,db,config,helpers){
 const{sql,first,all,requireAdmin,adminGuard,throttle,audit,auditChanged,requireProof,privateData}=helpers;
 const revision=async()=>(await first('SELECT version FROM data_revision WHERE id=1')).version;
 async function reauth(password,code){return requireProof(password,code)}
 const metrics=dataMetrics(db,config,{...helpers,reauth});
 function selection(params){
  if(params.action==='reset')return{kind:'penalties',where:'p.reset_id IS NULL'+(params.clubId?' AND p.club_id=?':''),args:params.clubId?[params.clubId]:[]};
  const d=DATASETS[params.kind];return{kind:params.kind,where:`${d.date}<?`+(params.kind==='penalties'?' AND (p.reset_id IS NOT NULL OR p.voided=1)':''),args:[params.before]};
 }
 async function jobFor(id){
  assert(typeof id==='string'&&uuid.test(id),'작업 정보를 확인해주세요.');const job=await first('SELECT * FROM data_jobs WHERE id=?',id);if(!job)throw failure('확인한 작업이 없습니다. 대상을 다시 확인해주세요.',404);
  const g=await adminGuard();if(job.owner!==g.args[0])throw failure('이 작업을 확인한 관리자 접속으로 다시 진행해주세요.',403);
  if(job.state!=='complete'&&job.expires<Date.now())throw failure('확인 시간이 지났습니다. 대상을 다시 확인해주세요.',409);
  return job;
 }
 const publicJob=job=>({id:job.id,action:job.action,label:job.label,targetName:job.target_name,total:job.total,points:job.points,processed:job.processed,step:job.step,state:job.state,exportReady:!!job.export_ready,completedAt:job.completed_at,params:JSON.parse(job.params)});
 async function handle(op,p,method){
  const metricResponse=await metrics.handle(op,p,method);if(metricResponse)return metricResponse;
  if(!['dataOverview','prepareDataAction','dataExport','executeDataAction','dataJob'].includes(op))return null;
  await requireAdmin();
  if(op==='dataOverview'&&method==='GET'){
   const result=await db.batch([
    sql('SELECT COUNT(*) AS count,MIN(date) AS oldest,MAX(date) AS newest FROM bookings'),
    sql('SELECT COUNT(*) AS count,MIN(date) AS oldest,SUM(CASE WHEN reset_id IS NULL AND voided=0 THEN 1 ELSE 0 END) AS current,COALESCE(SUM(CASE WHEN reset_id IS NULL AND voided=0 THEN points ELSE 0 END),0) AS points FROM penalty_records'),
    sql('SELECT COUNT(*) AS count,MIN(created_at) AS oldest FROM audit'),
    sql('SELECT c.id,c.name,c.room,c.active,COUNT(p.id) AS count,COALESCE(SUM(p.points),0) AS points FROM clubs c LEFT JOIN penalty_records p ON p.club_id=c.id AND p.reset_id IS NULL AND p.voided=0 GROUP BY c.id ORDER BY c.active DESC,c.name'),
    sql("SELECT id,label,target_name,total,points,completed_at FROM data_jobs WHERE action='reset' AND state='complete' ORDER BY completed_at DESC,id DESC LIMIT 30"),
    sql('SELECT 1 AS probe')
   ]);
   await requireAdmin();const bytes=result[5].meta?.size_after;const size=typeof bytes==='number'&&bytes>=0?bytes:null;
   return json({checkedAt:new Date().toISOString(),storageBytes:size,storageLevel:size===null?null:usageLevel(size/FREE_LIMITS.databaseBytes),limits:FREE_LIMITS,bookings:result[0].results[0],penalties:result[1].results[0],audit:result[2].results[0],clubs:result[3].results,resets:result[4].results});
  }
  if(op==='prepareDataAction'&&method==='POST'){
   assert(['reset','cleanup'].includes(p.action),'작업 종류를 확인해주세요.');const params={action:p.action};let label,targetName;
   if(p.action==='reset'){
    assert(typeof p.label==='string'&&p.label.trim().length>0&&p.label.trim().length<=80,'학기·처리명을 1~80자로 입력해주세요.');label=p.label.trim();params.clubId=p.clubId==='all'?'':String(p.clubId||'');assert(p.clubId,'대상 동아리를 선택해주세요.');
    if(params.clubId){const club=await first('SELECT name FROM clubs WHERE id=?',params.clubId);assert(club,'동아리를 찾을 수 없습니다.');targetName=club.name}else targetName='전체 동아리';
   }else{
    assert(['bookings','penalties','audit'].includes(p.kind),'정리할 기록 종류를 확인해주세요.');params.kind=p.kind;params.before=validDate(p.before,true);assert(params.before<today(),'정리 기준은 오늘 이전 날짜로 선택해주세요.');label=params.before+' 이전 기록 정리';targetName={bookings:'지난 예약',penalties:'마감·취소 벌점',audit:'이전 운영 기록'}[p.kind];
   }
   const chosen=selection(params),d=DATASETS[chosen.kind],rev=await revision();
   const count=await first(`SELECT COUNT(*) AS count${chosen.kind==='penalties'?',COALESCE(SUM(CASE WHEN p.voided=0 THEN p.points ELSE 0 END),0) AS points':''} FROM ${d.from} WHERE ${chosen.where}`,...chosen.args);
   if(await revision()!==rev)throw failure('자료가 변경되었습니다. 대상을 다시 확인해주세요.',409);
   const id=crypto.randomUUID(),g=await adminGuard();
   const inserted=await sql(`INSERT INTO data_jobs(id,owner,action,params,label,target_name,total,points,revision,created_at,expires) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${g.query} AND (SELECT version FROM data_revision WHERE id=1)=? RETURNING id`,id,g.args[0],p.action,JSON.stringify(params),label,targetName,count.count,count.points||0,rev,new Date().toISOString(),Date.now()+30*60000,...g.args,rev).all();
   if(!inserted.results.length){await requireAdmin();throw failure('자료가 변경되었습니다. 다시 확인해주세요.',409)}
   // Expired previews contain no business records and are not semester history.
   await sql("DELETE FROM data_jobs WHERE state='ready' AND processed=0 AND expires<? AND "+g.query,Date.now()-86400000,...g.args).run();
   return json({job:publicJob(await jobFor(id))});
  }
  if(op==='dataJob'&&method==='GET')return json({job:publicJob(await jobFor(p.id))});
  if(op==='dataExport'&&method==='POST'){
   let chosen,job=null,cursor=p.cursor||null,expectedPosition=0,rev;
   if(p.jobId){
    job=await jobFor(p.jobId);assert(job.state==='ready'&&job.processed===0,'이미 실행한 작업은 다시 내보낼 수 없습니다. 일반 CSV 내보내기를 이용해주세요.');
    expectedPosition=Number(p.position||0);assert(Number.isInteger(expectedPosition)&&expectedPosition>=0,'내보내기 순서를 확인해주세요.');
    if(expectedPosition===0){cursor=null}else{assert(expectedPosition===job.export_position,'다운로드 순서가 변경되었습니다. 처음부터 다시 내보내주세요.');cursor=job.export_cursor?JSON.parse(job.export_cursor):null}
    chosen=selection(JSON.parse(job.params));rev=job.revision;
   }else{
    assert(Object.hasOwn(DATASETS,p.kind),'내보내기 종류를 확인해주세요.');const from=validDate(p.from,true),to=validDate(p.to,true);assert(from<=to,'조회 기간을 확인해주세요.');const d=DATASETS[p.kind];chosen={kind:p.kind,where:`${d.where} AND ${d.date} BETWEEN ? AND ?`,args:[from,to]};rev=p.revision===undefined?await revision():Number(p.revision);assert(Number.isSafeInteger(rev)&&rev>=0,'내보내기 버전을 확인해주세요.');
   }
   if(await revision()!==rev)throw failure('자료가 변경되어 다운로드를 중단했습니다. 처음부터 다시 내보내주세요.',409);
   const d=DATASETS[chosen.kind],args=[...chosen.args];let where=chosen.where;
   if(cursor){assert(cursor&&typeof cursor.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(cursor.date)&&typeof cursor.id==='string'&&cursor.id.length<=100&&Number.isInteger(cursor.n),'내보내기 위치를 확인해주세요.');where+=` AND (${d.date}>? OR (${d.date}=? AND (${d.sort}>? OR (${d.sort}=? AND ${d.id}>?))))`;args.push(cursor.date,cursor.date,cursor.n,cursor.n,cursor.id)}
   const g=await adminGuard();const records=await all(`SELECT ${d.select},${d.date} AS sort_date,${d.sort} AS sort_n,${d.id} AS sort_id FROM ${d.from} WHERE ${where} AND ${g.query} ORDER BY ${d.date},${d.sort==='0'?d.id:d.sort+','+d.id} LIMIT ${PAGE+1}`,...args,...g.args);
   await requireAdmin();if(await revision()!==rev)throw failure('다운로드 중 자료가 변경되었습니다. 처음부터 다시 내보내주세요.',409);
   const page=await Promise.all(records.slice(0,PAGE).map(row=>chosen.kind==='bookings'?privateData.booking(row):chosen.kind==='penalties'?privateData.penalty(row):row)),last=page.at(-1),more=records.length>PAGE,next=more?{date:last.sort_date,n:last.sort_n,id:last.sort_id}:null;
   const rows=page.map(record=>Object.fromEntries(EXPORT_COLUMNS[chosen.kind].map(([key])=>[key,chosen.kind==='bookings'&&['start','end'].includes(key)?hm(record[key]):record[key]])));
   if(job){
    const update=await sql(`UPDATE data_jobs SET export_position=?,export_cursor=?,export_ready=? WHERE id=? AND state='ready' AND processed=0 AND export_position=? AND revision=(SELECT version FROM data_revision WHERE id=1) AND ${g.query} RETURNING id`,expectedPosition+rows.length,next?JSON.stringify(next):null,more?0:1,job.id,job.export_position,...g.args).all();
    if(!update.results.length)throw failure('다운로드 상태가 변경되었습니다. 처음부터 다시 내보내주세요.',409);
   }
   return json({kind:chosen.kind,rows,nextCursor:next,position:expectedPosition+rows.length,revision:rev,more});
  }
  if(op==='executeDataAction'&&method==='POST'){
   const job=await jobFor(p.id);if(job.state==='complete')return json({job:publicJob(job)});
   assert(job.export_ready===1&&p.backupConfirmed===true,'대상 CSV를 모두 다운로드하고 파일을 확인한 뒤 진행해주세요.');
   const phrase=job.action==='reset'?(JSON.parse(job.params).clubId?'개별 벌점 초기화':'전체 벌점 초기화'):'이전 기록 삭제';assert(p.confirmation===phrase,'확인 문구를 정확히 입력해주세요: '+phrase);
   const step=Number(p.step);assert(Number.isInteger(step)&&step>=0,'작업 순서를 확인해주세요.');if(step<job.step)return json({job:publicJob(job)});assert(step===job.step,'작업 진행 상태가 바뀌었습니다. 다시 확인해주세요.');if(job.authorized_until<Date.now())await reauth(p.adminPassword,p.code);
   if(await revision()!==job.revision)throw failure('대상 확인 후 자료가 변경되었습니다. 처리된 건수는 유지되며, 남은 대상을 다시 확인해주세요.',409);
   const params=JSON.parse(job.params),chosen=selection(params),d=DATASETS[chosen.kind],g=await adminGuard(),stamp=new Date().toISOString();
   const gate=`EXISTS(SELECT 1 FROM data_jobs WHERE id=? AND state='executing' AND step=?) AND ${g.query}`,gateArgs=[job.id,step,...g.args];
   const claim=sql(`UPDATE data_jobs SET state='executing',authorized_until=? WHERE id=? AND state='ready' AND step=? AND export_ready=1 AND revision=(SELECT version FROM data_revision WHERE id=1) AND ${g.query} RETURNING id`,Date.now()+5*60000,job.id,step,...g.args);
   const mutations=[];let amount=job.total;
   if(job.action==='reset'){
    mutations.push(sql(`INSERT INTO penalty_closures SELECT id,? FROM penalty_records WHERE reset_id IS NULL${params.clubId?' AND club_id=?':''} AND ${gate}`,job.id,...(params.clubId?[params.clubId]:[]),...gateArgs));
    mutations.push(sql(`INSERT INTO penalty_periods SELECT id,? FROM clubs WHERE ${params.clubId?'id=? AND ':''}${gate} ON CONFLICT(club_id) DO UPDATE SET start_date=MAX(penalty_periods.start_date,excluded.start_date)`,today(),...(params.clubId?[params.clubId]:[]),...gateArgs));
   }
   else{
    const table={bookings:'bookings',penalties:'penalties',audit:'audit'}[params.kind];const targets=`SELECT ${d.id} FROM ${d.from} WHERE ${chosen.where} ORDER BY ${d.date},${d.id} LIMIT ${BATCH}`;
    const count=await first(`SELECT COUNT(*) AS count FROM (${targets})`,...chosen.args);amount=count.count;
    if(params.kind==='bookings')mutations.push(sql(`DELETE FROM booking_access WHERE booking_id IN (${targets}) AND ${gate}`,...chosen.args,...gateArgs));
    mutations.push(sql(`DELETE FROM ${table} WHERE id IN (${targets}) AND ${gate}`,...chosen.args,...gateArgs));
   }
   const complete=job.action==='reset'||job.processed+amount>=job.total;
   await db.batch([claim,...mutations,
    sql('INSERT INTO audit SELECT ?,?,?,? WHERE '+gate,'DATA-'+job.id+'-'+step,job.action==='reset'?'RESET_PENALTIES':'PURGE_DATA',JSON.stringify({job:job.id,target:job.target_name,count:amount,label:job.label}),stamp,...gateArgs),
    sql(`UPDATE data_jobs SET processed=processed+?,step=step+1,state=?,revision=(SELECT version FROM data_revision WHERE id=1),completed_at=? WHERE id=? AND state='executing' AND step=? AND ${g.query}`,amount,complete?'complete':'ready',complete?stamp:null,job.id,step,...g.args)
   ]);
   const current=await jobFor(job.id);if(current.step!==step+1){await requireAdmin();throw failure('자료 또는 접속 상태가 변경되어 실행하지 않았습니다. 다시 확인해주세요.',409)}return json({job:publicJob(current)});
  }
  return null;
 }
 return{handle};
}
