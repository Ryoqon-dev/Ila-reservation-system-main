import {DEFAULT_SITE,DEFAULT_IMAGES,IMAGE_SLOTS,IMAGE_LIMITS,initialSiteContent} from './site-defaults.mjs';
import {assert} from './common/input.mjs';
import {hash,hex,json,failure} from './security.mjs';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const maxima={institution:40,term:3,organization:40,department:24,brand:20,brandMark:10,englishLabel:100,slogan:160,heroTitle:120,heroDescription:400,footerMessage:180,contactUrl:300,noticeTitle:100};
export function validateSiteSettings(value){
 assert(object(value),'사이트 설정 형식을 확인해주세요.');const out={};
 for(const [key,max]of Object.entries(maxima)){
  const text=value[key];assert(typeof text==='string'&&text.trim().length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text),'설정 항목의 길이와 내용을 확인해주세요: '+key);
  out[key]=text.trim();
 }
 for(const key of ['institution','term','organization','brand','heroTitle','noticeTitle'])assert(out[key].length>0,'필수 표시 항목을 입력해주세요: '+key);
 assert(/^[1-9]\d{0,2}$/.test(out.term),'대수는 1~999 사이 숫자로 입력해주세요.');
 let url;try{url=new URL(out.contactUrl)}catch{throw failure('문의 링크는 https://로 시작하는 주소를 입력해주세요.')}
 assert(url.protocol==='https:'&&!url.username&&!url.password,'문의 링크는 인증 정보가 없는 HTTPS 주소를 입력해주세요.');out.contactUrl=url.href;
 for(const [key,max]of [['equipmentNoticeTitle',100],['equipmentNoticeBody',4000],['boardNoticeTitle',100],['boardNoticeBody',4000]]){const v=value[key]===undefined?DEFAULT_SITE[key]:value[key];assert(typeof v==='string'&&v.trim().length>0&&v.trim().length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),'대여 팝업의 제목과 내용을 입력해주세요.');out[key]=v.trim();}
 assert(typeof value.noticeEnabled==='boolean','공지 팝업 표시 여부를 확인해주세요.');out.noticeEnabled=value.noticeEnabled;
 // Added in 1.3; older saved settings keep the home announcement off by default.
 const homeEnabled=value.homeNoticeEnabled===undefined?false:value.homeNoticeEnabled;
 assert(typeof homeEnabled==='boolean','첫 화면 공지 표시 여부를 확인해주세요.');out.homeNoticeEnabled=homeEnabled;
 for(const [key,max]of [['homeNoticeTitle',100],['homeNoticeBody',4000]]){
  const text=value[key]===undefined?DEFAULT_SITE[key]:value[key];
  assert(typeof text==='string'&&text.trim().length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text),'첫 화면 공지의 길이와 내용을 확인해주세요.');out[key]=text.trim();
 }
 if(homeEnabled)assert(out.homeNoticeTitle.length>0&&out.homeNoticeBody.length>0,'첫 화면 공지를 켜려면 제목과 내용을 입력해주세요.');
 assert(Array.isArray(value.notices)&&value.notices.length<=10,'공지는 최대 10개까지 등록할 수 있습니다.');const ids=new Set();
 out.notices=value.notices.map(n=>{
  assert(object(n)&&typeof n.id==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(n.id)&&!ids.has(n.id),'공지 식별 정보가 중복되거나 올바르지 않습니다.');ids.add(n.id);
  assert(typeof n.title==='string'&&n.title.trim().length>0&&n.title.trim().length<=100,'공지 제목은 1~100자로 입력해주세요.');
  assert(typeof n.body==='string'&&n.body.trim().length>0&&n.body.trim().length<=2400&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(n.body),'공지 내용은 1~2400자로 입력해주세요.');
  assert(typeof n.enabled==='boolean','공지 표시 여부를 확인해주세요.');return{id:n.id,title:n.title.trim(),body:n.body.trim(),enabled:n.enabled};
 });return out;
}
const ascii=(b,start,end)=>String.fromCharCode(...b.subarray(start,end));
// Header dimensions only; no image decoder or executable SVG content runs on the server.
export function imageDimensions(b,mime){
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength);let width=0,height=0;
 if(mime==='image/png'){
  assert(b.length>=33&&hex(b.subarray(0,8))==='89504e470d0a1a0a'&&ascii(b,12,16)==='IHDR'&&view.getUint32(8)===13,'PNG 파일 형식이 올바르지 않습니다.');width=view.getUint32(16);height=view.getUint32(20);
 }else if(mime==='image/webp'){
  assert(b.length>=30&&ascii(b,0,4)==='RIFF'&&ascii(b,8,12)==='WEBP'&&view.getUint32(4,true)+8===b.length,'WebP 파일 형식이 올바르지 않습니다.');const kind=ascii(b,12,16);
  if(kind==='VP8X'){assert((b[20]&2)===0,'움직이는 이미지는 사용할 수 없습니다.');width=1+b[24]+(b[25]<<8)+(b[26]<<16);height=1+b[27]+(b[28]<<8)+(b[29]<<16)}
  else if(kind==='VP8 '){assert(b[23]===0x9d&&b[24]===1&&b[25]===0x2a,'WebP 이미지 정보를 확인해주세요.');width=view.getUint16(26,true)&0x3fff;height=view.getUint16(28,true)&0x3fff}
  else if(kind==='VP8L'){assert(b[20]===0x2f,'WebP 이미지 정보를 확인해주세요.');width=1+b[21]+((b[22]&0x3f)<<8);height=1+(b[22]>>6)+(b[23]<<2)+((b[24]&0xf)<<10)}
 }else if(mime==='image/jpeg'){
  assert(b.length>=12&&b[0]===0xff&&b[1]===0xd8&&b.at(-2)===0xff&&b.at(-1)===0xd9,'JPEG 파일 형식이 올바르지 않습니다.');
  let i=2;while(i+4<=b.length){assert(b[i]===0xff,'JPEG 이미지 정보를 확인해주세요.');while(b[i]===0xff)i++;const marker=b[i++];if(marker===0xd9||marker===0xda)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;assert(i+2<=b.length,'JPEG 파일이 잘렸습니다.');const length=view.getUint16(i);assert(length>=2&&i+length<=b.length,'JPEG 파일이 잘렸습니다.');if([0xc0,0xc1,0xc2].includes(marker)){assert(length>=8,'JPEG 이미지 정보를 확인해주세요.');height=view.getUint16(i+3);width=view.getUint16(i+5);break}i+=length}
 }
 assert(width>0&&height>0&&width<=4096&&height<=4096&&width*height<=8000000,'이미지는 가로·세로 4096px, 총 800만 화소 이하로 준비해주세요.');return{width,height};
}
export async function validateSiteImages(value){
 assert(object(value),'이미지 변경 항목을 확인해주세요.');assert(Object.keys(value).every(k=>IMAGE_SLOTS.includes(k)),'허용되지 않은 이미지 항목입니다.');const images={};
 for(const slot of IMAGE_SLOTS){
  if(!Object.hasOwn(value,slot))continue;const file=value[slot];if(file===null){images[slot]=null;continue}
  assert(object(file)&&['image/png','image/jpeg','image/webp'].includes(file.mime),'PNG·JPEG·WebP 이미지만 사용할 수 있습니다. SVG는 지원하지 않습니다.');
  assert(typeof file.base64==='string'&&file.base64.length>0&&file.base64.length<=Math.ceil(IMAGE_LIMITS[slot]/3)*4&&file.base64.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64),'이미지 크기 또는 인코딩을 확인해주세요.');
  let raw;try{raw=atob(file.base64)}catch{throw failure('이미지 인코딩을 확인해주세요.')}
  const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);assert(bytes.length<=IMAGE_LIMITS[slot],'이미지가 허용 용량을 초과했습니다.');imageDimensions(bytes,file.mime);
  images[slot]={mime:file.mime,data:bytes.buffer,revision:hex(await crypto.subtle.digest('SHA-256',bytes))};
 }return images;
}
async function publicContent(row){
 if(!row)return initialSiteContent();const settings={...DEFAULT_SITE,...JSON.parse(row.settings)},versions=JSON.parse(row.image_versions);
 const notice=JSON.stringify([settings.noticeTitle,settings.noticeEnabled,settings.notices]),defaultNotice=JSON.stringify([DEFAULT_SITE.noticeTitle,DEFAULT_SITE.noticeEnabled,DEFAULT_SITE.notices]);
 return{version:row.version,settings,images:Object.fromEntries(IMAGE_SLOTS.map(slot=>[slot,versions[slot]?'/api/system?'+new URLSearchParams({op:'siteImage',slot,v:versions[slot]}):DEFAULT_IMAGES[slot]])),noticeVersion:notice===defaultNotice?'v8':await hash(notice),updatedAt:row.updated_at};
}
export function siteContent(req,db,{sql,first,requireAdmin,adminGuard}){
 const read=()=>first('SELECT * FROM site_content WHERE id=1');
 async function handle(op,p,method){
  if(op==='siteContent'&&method==='GET')return json(await publicContent(await read()));
  if(op==='siteImage'&&method==='GET'){
   const slot=p.slot,revision=p.v;if(!IMAGE_SLOTS.includes(slot)||!/^[a-f0-9]{64}$/.test(revision||''))throw failure('이미지를 찾을 수 없습니다.',404);
   const row=await first('SELECT * FROM site_images WHERE slot=? AND revision=?',slot,revision);if(!row)throw failure('이미지를 찾을 수 없습니다.',404);
   const headers={'Content-Type':row.mime,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':(req.headers.has('authorization')?'private':'public')+', max-age=31536000, immutable','ETag':'"'+row.revision+'"'};
   if(req.headers.get('if-none-match')===headers.ETag)return new Response(null,{status:304,headers});return new Response(new Uint8Array(row.data),{headers});
  }
  if(op!=='saveSiteContent'||method!=='POST')return null;
  await requireAdmin();assert(typeof p.requestKey==='string'&&idPattern.test(p.requestKey),'저장 요청 정보를 확인해주세요.');assert(typeof p.baseVersion==='string'&&(p.baseVersion==='initial'||idPattern.test(p.baseVersion)),'기존 설정 버전을 확인해주세요.');
  const settings=validateSiteSettings(p.settings),images=await validateSiteImages(p.images===undefined?{}:p.images);
  const normalizedImages=Object.fromEntries(Object.entries(images).map(([slot,image])=>[slot,image?{mime:image.mime,revision:image.revision}:null]));
  const payloadHash=await hash(JSON.stringify({baseVersion:p.baseVersion,settings,images:normalizedImages}));const old=await read();
  if(old?.version===p.requestKey){if(old.payload_hash!==payloadHash)throw failure('같은 요청으로 다른 내용을 저장할 수 없습니다.',409);return json(await publicContent(old))}
  if((old?.version||'initial')!==p.baseVersion)throw failure('다른 곳에서 설정을 변경했습니다. 최신 설정을 다시 불러온 뒤 수정해주세요.',409);
  const versions=old?JSON.parse(old.image_versions):{};for(const [slot,image]of Object.entries(images)){if(image)versions[slot]=image.revision;else delete versions[slot]}
  const stamp=new Date().toISOString(),guard=await adminGuard();
  const change=old?sql(`UPDATE site_content SET version=?,payload_hash=?,settings=?,image_versions=?,updated_at=? WHERE id=1 AND version=? AND ${guard.query} RETURNING id`,p.requestKey,payloadHash,JSON.stringify(settings),JSON.stringify(versions),stamp,p.baseVersion,...guard.args):sql(`INSERT INTO site_content SELECT 1,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM site_content WHERE id=1) AND ${guard.query} RETURNING id`,p.requestKey,payloadHash,JSON.stringify(settings),JSON.stringify(versions),stamp,...guard.args);
  const gate=`EXISTS(SELECT 1 FROM site_content WHERE id=1 AND version=? AND payload_hash=?) AND ${guard.query}`,args=[p.requestKey,payloadHash,...guard.args];
  const mutations=Object.entries(images).map(([slot,image])=>image?sql(`INSERT INTO site_images SELECT ?,?,?,? WHERE ${gate} ON CONFLICT(slot) DO UPDATE SET revision=excluded.revision,mime=excluded.mime,data=excluded.data`,slot,image.revision,image.mime,image.data,...args):sql('DELETE FROM site_images WHERE slot=? AND '+gate,slot,...args));
  await db.batch([change,...mutations,sql('INSERT OR IGNORE INTO audit SELECT ?,?,?,? WHERE '+gate,'CONTENT-'+p.requestKey,'SAVE_SITE_CONTENT',p.requestKey,stamp,...args)]);
  const current=await read();if(current?.version!==p.requestKey||current.payload_hash!==payloadHash){await requireAdmin();throw failure('설정이 변경되어 저장하지 못했습니다. 최신 설정을 다시 불러와주세요.',409)}
  return json(await publicContent(current));
 }
 return{handle};
}
