import {assert} from './common/input.mjs';
import {crypt,hmac,json,failure} from './security.mjs';
export const FREE_LIMITS={databaseBytes:500000000,d1RowsRead:5000000,d1RowsWritten:100000,workerRequests:100000,cpuMs:10};
export const usageLevel=ratio=>ratio>=.95?'danger':ratio>=.85?'warning':ratio>=.70?'notice':'normal';
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export async function cloudflareUsage(accountId,token,fetchImpl=fetch){
 const date=new Date().toISOString().slice(0,10),start=date+'T00:00:00.000Z',end=new Date().toISOString();
 const query=`query { viewer { accounts(filter:{accountTag:${JSON.stringify(accountId)}}) {
  d1AnalyticsAdaptiveGroups(limit:10,filter:{date_geq:${JSON.stringify(date)},date_leq:${JSON.stringify(date)}}){sum{rowsRead rowsWritten}}
  workersInvocationsAdaptive(limit:10,filter:{datetime_geq:${JSON.stringify(start)},datetime_leq:${JSON.stringify(end)}}){sum{requests errors} quantiles{cpuTimeP99}}
 } } }`;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  // Workers supports manual/follow only. Never follow redirects with a bearer token.
  const response=await fetchImpl('https://api.cloudflare.com/client/v4/graphql',{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:controller.signal});
  if(response.status>=300&&response.status<400)throw failure('Cloudflare 통계 서버가 다른 주소로 이동하도록 응답해 조회를 중단했습니다. 토큰은 다른 주소로 전송하지 않았습니다.',502);
  if(!response.ok)throw failure('Cloudflare 조회 권한 또는 연결 상태를 확인해주세요.',502);
  let body;try{body=await response.json()}catch{throw failure('Cloudflare 통계 서버의 응답을 읽지 못했습니다. 잠시 후 다시 확인해주세요.',502)}
  if(body?.errors?.length)throw failure('Cloudflare 통계 조회에 실패했습니다. Account Analytics 읽기 권한과 계정 ID를 확인해주세요.',502);
  const data=body?.data?.viewer?.accounts?.[0];if(!data||!Array.isArray(data.d1AnalyticsAdaptiveGroups)||!Array.isArray(data.workersInvocationsAdaptive))throw failure('Cloudflare 통계 형식이 바뀌었거나 접근 권한이 없습니다.',502);
  const sum=(rows,key)=>{assert(rows.every(r=>finite(r.sum?.[key])),'통계 값이 올바르지 않습니다.');return rows.reduce((n,r)=>n+r.sum[key],0)};
  const cpus=data.workersInvocationsAdaptive.map(r=>r.quantiles?.cpuTimeP99).filter(finite);
  return{date,checkedAt:new Date().toISOString(),rowsRead:sum(data.d1AnalyticsAdaptiveGroups,'rowsRead'),rowsWritten:sum(data.d1AnalyticsAdaptiveGroups,'rowsWritten'),workerRequests:sum(data.workersInvocationsAdaptive,'requests'),workerErrors:sum(data.workersInvocationsAdaptive,'errors'),cpuP99Ms:cpus.length?Math.max(...cpus)/1000:null};
 }catch(error){if(error.status)throw error;if(error.name==='AbortError')throw failure('Cloudflare 통계 서버의 응답이 8초 안에 도착하지 않았습니다. 잠시 후 다시 확인해주세요.',504);throw failure('Cloudflare 통계에 연결하지 못했습니다. 잠시 후 다시 확인해주세요.',502)}finally{clearTimeout(timer)}
}
export function dataMetrics(db,config,{sql,first,requireAdmin,adminGuard,reauth,auditChanged}){
 const key=()=>hmac(config.roomKey,'ila-data-metrics-token-v1');
 async function handle(op,p,method){
  if(!['metricsLink','saveMetricsLink','removeMetricsLink','cloudUsage'].includes(op))return null;
  await requireAdmin();
  const old=await first('SELECT * FROM data_metrics WHERE id=1');
  if(op==='metricsLink'&&method==='GET')return json({connected:!!old,accountId:old?.account_id||'',lastSynced:old?.refreshed_at||null});
  if(op==='saveMetricsLink'&&method==='POST'){
   await reauth(p.adminPassword,p.code);assert(typeof p.accountId==='string'&&/^[a-f0-9]{32}$/.test(p.accountId),'Cloudflare 계정 ID 32자리를 입력해주세요.');assert(typeof p.token==='string'&&/^[A-Za-z0-9_-]{20,200}$/.test(p.token),'조회용 API 토큰을 입력해주세요.');
   const value=await cloudflareUsage(p.accountId,p.token,config.metricsFetch||fetch);const cipher=await crypt(p.token,await key()),g=await adminGuard();
   const result=await db.batch([sql(`INSERT INTO data_metrics SELECT 1,?,?,?,? WHERE ${g.query} ON CONFLICT(id) DO UPDATE SET account_id=excluded.account_id,token_cipher=excluded.token_cipher,cache=excluded.cache,refreshed_at=excluded.refreshed_at RETURNING id`,p.accountId,cipher,JSON.stringify(value),value.checkedAt,...g.args),auditChanged('SAVE_METRICS_LINK','read-only analytics')]);
   if(!result[0].results.length)throw failure('관리자 로그인이 만료되었습니다.',401,'admin');return json({connected:true,usage:value});
  }
  if(op==='removeMetricsLink'&&method==='POST'){await reauth(p.adminPassword,p.code);const g=await adminGuard();await db.batch([sql('DELETE FROM data_metrics WHERE '+g.query,...g.args),auditChanged('REMOVE_METRICS_LINK','read-only analytics')]);return json({ok:true})}
  if(op==='cloudUsage'&&method==='GET'){
   if(!old)return json({connected:false,usage:null});
   if(old.cache&&JSON.parse(old.cache).date===new Date().toISOString().slice(0,10)&&Date.now()-Date.parse(old.refreshed_at)<300000)return json({connected:true,usage:JSON.parse(old.cache),cached:true});
   try{const value=await cloudflareUsage(old.account_id,await crypt(old.token_cipher,await key(),true),config.metricsFetch||fetch);await requireAdmin();const g=await adminGuard();await sql('UPDATE data_metrics SET cache=?,refreshed_at=? WHERE id=1 AND token_cipher=? AND '+g.query,JSON.stringify(value),value.checkedAt,old.token_cipher,...g.args).run();await requireAdmin();return json({connected:true,usage:value,cached:false})}
   catch(error){if(error.scope==='admin')throw error;await requireAdmin();return json({connected:true,usage:old.cache&&JSON.parse(old.cache).date===new Date().toISOString().slice(0,10)?JSON.parse(old.cache):null,stale:true,error:'사용량을 갱신하지 못했습니다. 마지막 확인값이며 현재 사용량과 다를 수 있습니다.'})}
  }
  return null;
 }
 return{handle};
}
