import {assert} from './common/input.mjs';
import {hash,json,failure} from './security.mjs';
import {validateSiteImages} from './site-content.mjs';
export const CATALOG_SECTIONS=['guide','equipment','board'];
export const CATALOG_IMAGE_BUDGET=20*1024*1024;
export const CATALOG_LIMIT=100;
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const text=(v,max,required=false)=>{assert(typeof v==='string'&&v.trim().length<=max&&(!required||v.trim().length)&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),'제목·설명의 길이와 내용을 확인해주세요.');return v.trim()};
const publicEntry=r=>({id:r.id,section:r.section,title:r.title,body:r.body,position:r.position,visible:!!r.visible,version:r.version,image:r.image_revision?'/api/system?'+new URLSearchParams({op:'entryImage',id:r.id,v:r.image_revision}):null});
export function catalog(req,db,{sql,all,first,requireAdmin,adminGuard,auditChanged}){
 const list=async(section,admin=false)=>(await all('SELECT id,section,title,body,position,visible,version,image_revision FROM content_entries WHERE section=?'+(admin?'':' AND visible=1')+' ORDER BY position,id',section)).map(publicEntry);
 return {async handle(op,p,method){
  if(!['catalog','entryImage','saveCatalogEntry','deleteCatalogEntry','moveCatalogEntry'].includes(op))return null;
  if(op==='entryImage'&&method==='GET'){
   assert(uuid(p.id)&&/^[a-f0-9]{64}$/.test(p.v||''),'이미지 주소를 확인해주세요.');
   const row=await first('SELECT visible,mime,data,image_revision FROM content_entries WHERE id=? AND image_revision=?',p.id,p.v);if(!row?.data)throw failure('이미지를 찾을 수 없습니다.',404);
   if(!row.visible)await requireAdmin();
   const headers={'Content-Type':row.mime,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'private, max-age=0, must-revalidate',ETag:'"'+row.image_revision+'"'};
   if(req.headers.get('if-none-match')===headers.ETag)return new Response(null,{status:304,headers});return new Response(row.data,{headers});
  }
  if(op==='catalog'&&method==='GET'){
   assert(CATALOG_SECTIONS.includes(p.section),'안내 목록 종류를 확인해주세요.');const admin=p.admin==='true';if(admin)await requireAdmin();
   const entries=await list(p.section,admin);return json({entries,...(admin?{imageBytes:(await first('SELECT COALESCE(SUM(length(data)),0) AS n FROM content_entries')).n,imageBudget:CATALOG_IMAGE_BUDGET,limit:CATALOG_LIMIT}:{} )});
  }
  await requireAdmin();assert(method==='POST','저장 요청 방식을 확인해주세요.');assert(uuid(p.id),'항목 식별 정보를 확인해주세요.');
  const old=await first('SELECT * FROM content_entries WHERE id=?',p.id),g=await adminGuard();
  if(op==='saveCatalogEntry'){
   assert(CATALOG_SECTIONS.includes(p.section)&&(!old||old.section===p.section),'안내 목록 종류를 확인해주세요.');assert(uuid(p.requestKey)&&typeof p.baseVersion==='string','저장 요청 버전을 확인해주세요.');
   const title=text(p.title,100,true),body=text(p.body,4000),visible=p.visible;assert(typeof visible==='boolean','표시 여부를 확인해주세요.');
   let image;if(Object.hasOwn(p,'image'))image=(await validateSiteImages({logo:p.image})).logo;
   const digest=await hash(JSON.stringify([p.section,title,body,visible,Object.hasOwn(p,'image')?(image?.revision||null):'keep',p.baseVersion]));
   if(old?.version===p.requestKey){assert(old.payload_hash===digest,'같은 요청으로 다른 내용을 저장할 수 없습니다.');return json({entry:publicEntry(old)})}
   if((old?.version||'initial')!==p.baseVersion)throw failure('다른 창에서 항목을 변경했습니다. 목록을 새로고침해주세요.',409);
   const picture=image===undefined?{data:old?.data||null,mime:old?.mime||null,revision:old?.image_revision||null}:image;
   const budget=`COALESCE((SELECT SUM(length(data)) FROM content_entries WHERE id<>?),0)+?<=?`;
   const size=picture?.data?.byteLength||0,stamp=new Date().toISOString();
   const args=[title,body,visible?1:0,p.requestKey,digest,picture?.revision||null,picture?.mime||null,picture?.data||null,stamp];
   const change=old?sql(`UPDATE content_entries SET title=?,body=?,visible=?,version=?,payload_hash=?,image_revision=?,mime=?,data=?,updated_at=? WHERE id=? AND version=? AND ${budget} AND ${g.query} RETURNING id`,...args,p.id,p.baseVersion,p.id,size,CATALOG_IMAGE_BUDGET,...g.args):sql(`INSERT INTO content_entries(id,section,title,body,visible,version,payload_hash,image_revision,mime,data,updated_at,position) SELECT ?,?,?, ?,?,?,?,?,?,?,?,COALESCE((SELECT MAX(position)+1 FROM content_entries WHERE section=?),0) WHERE (SELECT COUNT(*) FROM content_entries WHERE section=?)<? AND ${budget} AND ${g.query} RETURNING id`,p.id,p.section,...args,p.section,p.section,CATALOG_LIMIT,p.id,size,CATALOG_IMAGE_BUDGET,...g.args);
   const r=await db.batch([change,auditChanged('SAVE_CONTENT_ENTRY',p.id)]);if(!r[0].results.length){await requireAdmin();throw failure('저장하지 못했습니다. 목록 변경 여부와 항목 수·이미지 총용량(20MB)을 확인해주세요.',409)}
   return json({entry:publicEntry(await first('SELECT * FROM content_entries WHERE id=?',p.id))});
  }
  assert(old,'항목을 찾을 수 없습니다.');if(old.version!==p.baseVersion)throw failure('항목이 변경되었습니다. 목록을 새로고침해주세요.',409);
  if(op==='deleteCatalogEntry'){
   const r=await db.batch([sql('DELETE FROM content_entries WHERE id=? AND version=? AND '+g.query+' RETURNING id',p.id,p.baseVersion,...g.args),auditChanged('DELETE_CONTENT_ENTRY',p.id)]);assert(r[0].results.length,'삭제하지 못했습니다. 목록을 다시 확인해주세요.');return json({ok:true});
  }
  assert(p.delta===1||p.delta===-1,'이동 방향을 확인해주세요.');const rows=await all('SELECT id,position,version FROM content_entries WHERE section=? ORDER BY position,id',old.section),index=rows.findIndex(r=>r.id===p.id),other=rows[index+p.delta];assert(other,'더 이상 이동할 수 없습니다.');
  const version=crypto.randomUUID();const r=await db.batch([sql(`UPDATE content_entries SET position=CASE WHEN id=? THEN ? ELSE ? END,version=?,payload_hash='' WHERE id IN (?,?) AND (SELECT COUNT(*) FROM content_entries WHERE (id=? AND version=?) OR (id=? AND version=?))=2 AND ${g.query} RETURNING id`,old.id,other.position,old.position,version,old.id,other.id,old.id,old.version,other.id,other.version,...g.args),auditChanged('MOVE_CONTENT_ENTRY',old.id)]);
  if(r[0].results.length!==2)throw failure('목록 순서가 변경되었습니다. 새로고침해주세요.',409);return json({ok:true});
 }};
}
