import {FLOORS} from './floorplan-defaults.mjs';
import {assert,normalizedName} from './common/input.mjs';
import {json,failure} from './security.mjs';
export const CONTACT_ROLES=['president','vicePresident','treasurer'];
export const blankContacts=()=>Object.fromEntries(CONTACT_ROLES.map(role=>[role,{name:'',phone:'',studentId:''}]));
export const contactDefaults=value=>Object.fromEntries(CONTACT_ROLES.map(role=>[role,{name:value?.[role]?.name||'',phone:value?.[role]?.phone||'',studentId:value?.[role]?.studentId||''}]));
export function validateContacts(value,previous={}){
 assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>CONTACT_ROLES.includes(k)),'임원 정보 형식을 확인해주세요.');const out=blankContacts();
 for(const role of CONTACT_ROLES){
  const row=value[role]||{name:'',phone:''};
  assert(typeof row.name==='string'&&row.name.trim().length<=40&&!/[\u0000-\u001f\u007f]/.test(row.name),'임원 이름을 확인해주세요.');
  assert(typeof row.phone==='string'&&/^[0-9\s()+-]{0,30}$/.test(row.phone),'임원 전화번호를 확인해주세요.');
  const phone=row.phone.replace(/\D/g,'');assert(!phone||/^\d{9,11}$/.test(phone),'전화번호는 숫자 9~11자리로 입력해주세요.');
  const studentId=row.studentId===undefined?(previous[role]?.studentId||''):row.studentId;
  assert(typeof studentId==='string'&&(!studentId||/^[0-9]{10}$/.test(studentId)),'임원 학번은 숫자 10자리로 입력해주세요.');
  out[role]={name:row.name.trim(),phone,studentId};
 }
 return out;
}

const roomKey=v=>String(v).normalize('NFKC').replace(/\s|호실|호|컨테이너|실외|번/g,'').toUpperCase();
const matches=(a,b)=>String(a).split(/[·,\/]/).some(part=>String(b).split(/[·,\/]/).some(other=>roomKey(part)===roomKey(other)));
export function clubRooms(db,{sql,all,first,requireAdmin,adminGuard,auditChanged}){
 const read=()=>first('SELECT * FROM room_layout WHERE id=1');
 const allSpaces=()=>FLOORS.flatMap(f=>[...f.spaces,...(f.knownRooms||[]).map((r,i)=>({...r,id:r.id||f.id+'-known-'+i,kind:'room',clubNames:r.clubNames||[r.label||r.club||'']}))].map(s=>({...s,floorId:f.id})));
 async function state(){const row=await read();return {row,overrides:JSON.parse(row.overrides)}}
 async function findSpace(code){const {overrides}=await state();return allSpaces().find(s=>s.kind==='room'&&matches(overrides[s.id]?.code||s.code,code))?.id||null;}
 async function payload(){
  const {row,overrides}=await state(),clubs=await all('SELECT id,name,room,active FROM clubs'),assignments=await all('SELECT * FROM club_room_assignments');const byId=new Map(assignments.map(a=>[a.club_id,a.space_id]));
  const resolve=space=>{const value={...space,...overrides[space.id]};const assigned=clubs.filter(c=>byId.has(c.id)?byId.get(c.id)===space.id:matches(value.code,c.room));const originals=space.clubNames||[],knownElsewhere=originals.some(name=>clubs.some(c=>normalizedName(c.name)===normalizedName(name))),sourceNames=assigned.length||knownElsewhere?[]:originals;const displayLabel=overrides[space.id]?.label||(!assigned.length&&knownElsewhere?'미배정':space.label);return {...value,displayLabel,clubIds:assigned.map(c=>c.id),clubLabels:assigned.map(c=>c.name),sourceNames};};
  const flat=allSpaces();return {version:row.version,floors:FLOORS.map(f=>({...f,spaces:f.spaces.map(s=>resolve({...s,floorId:f.id})),knownRooms:flat.filter(s=>s.floorId===f.id&&!f.spaces.some(p=>p.id===s.id)).map(resolve)}))};
 }
 async function handle(op,p,method){
  if(!['floorplan','saveRoomAssignment'].includes(op))return null;await requireAdmin();
  if(op==='floorplan'&&method==='GET')return json(await payload());
  assert(op==='saveRoomAssignment'&&method==='POST','배치 변경 요청을 확인해주세요.');
  const {row,overrides}=await state(),space=allSpaces().find(s=>s.id===p.spaceId&&s.kind==='room');assert(space,'변경할 동아리방을 찾을 수 없습니다.');
  assert(typeof p.code==='string'&&p.code.trim().length>0&&p.code.trim().length<=40&&!/[\u0000-\u001f\u007f]/.test(p.code),'호실은 1~40자로 입력해주세요.');
  assert(typeof p.label==='string'&&p.label.trim().length<=100&&!/[\u0000-\u001f\u007f]/.test(p.label),'방 표시 이름을 확인해주세요.');
  assert(Array.isArray(p.clubIds)&&p.clubIds.length<=10&&p.clubIds.every(v=>typeof v==='string')&&new Set(p.clubIds).size===p.clubIds.length,'배정할 동아리를 확인해주세요.');
  if(row.version!==p.baseVersion)throw failure('배치나 동아리 정보가 변경되었습니다. 최신 배치를 불러온 뒤 다시 저장해주세요.',409);
  const code=p.code.trim();assert(!allSpaces().some(s=>s.id!==space.id&&s.kind==='room'&&matches(overrides[s.id]?.code||s.code,code)),'다른 방에서 사용 중인 호실입니다.');
  const clubs=await all('SELECT id,room FROM clubs');assert(p.clubIds.every(id=>clubs.some(c=>c.id===id)),'등록되지 않은 동아리입니다.');
  const current=await payload(),previous=current.floors.flatMap(f=>[...f.spaces,...f.knownRooms]).find(s=>s.id===space.id).clubIds;
  const next={...overrides,[space.id]:{code,label:p.label.trim()}},version=crypto.randomUUID(),stamp=new Date().toISOString(),g=await adminGuard();
  const gate=`EXISTS(SELECT 1 FROM room_layout WHERE id=1 AND version=?) AND ${g.query}`,args=[version,...g.args];
  const mutations=[sql('UPDATE room_layout SET version=?,overrides=?,updated_at=? WHERE id=1 AND version=? AND '+g.query+' RETURNING id',version,JSON.stringify(next),stamp,p.baseVersion,...g.args)];
  const removed=previous.filter(id=>!p.clubIds.includes(id));
  for(const id of removed){mutations.push(sql("UPDATE clubs SET room='미배정',updated_at=? WHERE id=? AND "+gate,stamp,id,...args),sql('DELETE FROM club_room_assignments WHERE club_id=? AND '+gate,id,...args));}
  for(const id of p.clubIds){mutations.push(sql('UPDATE clubs SET room=?,updated_at=? WHERE id=? AND '+gate,code,stamp,id,...args),sql('INSERT INTO club_room_assignments SELECT ?,? WHERE '+gate+' ON CONFLICT(club_id) DO UPDATE SET space_id=excluded.space_id',id,space.id,...args));}
  mutations.push(sql('INSERT INTO audit SELECT ?,?,?,? WHERE '+gate,crypto.randomUUID(),'SAVE_ROOM_ASSIGNMENT',space.id,stamp,...args));
  const changed=await db.batch(mutations);if(!changed[0].results.length){await requireAdmin();throw failure('배치가 변경되었습니다. 최신 배치를 다시 확인해주세요.',409)}return json(await payload());
 }
 return {handle,findSpace};
}
