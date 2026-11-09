import {assert,today,validDate} from './rules.mjs';

export const CLUB_TYPES=[{value:'REGULAR',label:'정동아리'},{value:'ASSOCIATE',label:'준동아리'},{value:'NEW',label:'신규동아리'}];
export const CLUB_DIVISIONS=[{value:'PERFORMANCE',label:'공연분과'},{value:'VOLUNTEER',label:'봉사분과'},{value:'SPORTS',label:'체육분과'},{value:'CULTURE_ACADEMIC',label:'교양/학술 분과'}];
export const clubTypeLabel=value=>CLUB_TYPES.find(t=>t.value===value)?.label||'미지정';
export const clubDivisionLabel=value=>CLUB_DIVISIONS.find(t=>t.value===value)?.label||'미지정';
export const blankClubProfile=()=>({type:'',typeDate:'',division:'',memberCount:null,advisor:'',version:'initial'});

export function validateClubProfile(value){
 assert(value&&typeof value==='object'&&!Array.isArray(value),'동아리 상태·분과 정보 형식을 확인해주세요.');
 assert(Object.keys(value).every(k=>['type','typeDate','division','memberCount','advisor','baseVersion'].includes(k)),'동아리 정보 항목을 확인해주세요.');
 const {type,typeDate,division,memberCount,advisor,baseVersion}=value;
 assert(typeof type==='string'&&(type===''||CLUB_TYPES.some(t=>t.value===type)),'동아리 상태를 선택해주세요.');
 assert(typeof typeDate==='string','상태 기준일을 확인해주세요.');
 if(type){validDate(typeDate,true);assert(typeDate<=today(),'상태 기준일은 오늘 또는 지난 날짜로 선택해주세요.')}else assert(typeDate==='','상태가 미지정이면 기준일을 비워주세요.');
 assert(typeof division==='string'&&(division===''||CLUB_DIVISIONS.some(d=>d.value===division)),'동아리 분과를 선택해주세요.');
 assert(memberCount===null||(Number.isSafeInteger(memberCount)&&memberCount>=0&&memberCount<=100000),'회원 수는 0~100000 사이의 정수로 입력해주세요.');
 assert(typeof advisor==='string'&&advisor.trim().length<=40&&!/[\u0000-\u001f\u007f]/.test(advisor),'지도교수 이름은 40자 이내로 입력해주세요.');
 assert(typeof baseVersion==='string'&&(baseVersion==='initial'||/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(baseVersion)),'동아리 정보가 오래되었습니다. 새로고침 후 다시 저장해주세요.');
 return {type,typeDate,division,memberCount,advisor:advisor.trim(),baseVersion};
}

export function filterDirectory(clubs,{archived=false,account='all',type='all',division='all',query=''}={}){
 const word=query.toLocaleLowerCase('ko-KR');
 return clubs.filter(c=>(archived||c.active)&&(account==='all'||c.account_status===account)&&(type==='all'||c.profile?.type===type)&&(division==='all'||c.profile?.division===division)&&[c.name,c.room,c.account_username||''].some(s=>String(s).toLocaleLowerCase('ko-KR').includes(word)));
}

export function directoryCounts(clubs,archived=false){
 const rows=clubs.filter(c=>archived||c.active);
 return {all:rows.length,PENDING:rows.filter(c=>c.account_status==='PENDING').length,APPROVED:rows.filter(c=>c.account_status==='APPROVED').length,types:Object.fromEntries(CLUB_TYPES.map(t=>[t.value,rows.filter(c=>c.profile?.type===t.value).length])),divisions:Object.fromEntries(CLUB_DIVISIONS.map(d=>[d.value,rows.filter(c=>c.profile?.division===d.value).length]))};
}
