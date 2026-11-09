import {useState} from 'react';
import {CLUB_TYPES,CLUB_DIVISIONS,blankClubProfile,clubTypeLabel,clubDivisionLabel,directoryCounts} from '../lib/club-profile.mjs';
import {today} from '../lib/rules.mjs';
type Row=Record<string,any>;
export type DirectorySelection={account:string,type:string,division:string};
export const allDirectoryFilters:DirectorySelection={account:'all',type:'all',division:'all'};

export function DirectoryFilters({clubs,archived,filters,onChange}:{clubs:Row[],archived:boolean,filters:DirectorySelection,onChange:(value:DirectorySelection)=>void}){
 const counts=directoryCounts(clubs,archived),all=filters.account==='all'&&filters.type==='all'&&filters.division==='all';
 const groups=[
  {key:'account',label:'등록·계정 상태',options:[{value:'all',label:'등록 동아리'},{value:'PENDING',label:'가입 승인 대기'},{value:'APPROVED',label:'정식 대표 계정'}],counts},
  {key:'type',label:'동아리 상태',options:CLUB_TYPES,counts:counts.types},
  {key:'division',label:'동아리 분과',options:CLUB_DIVISIONS,counts:counts.divisions}
 ];
 return <section className="directory-filter-panel" aria-label="동아리 목록 필터"><div className="directory-filter-heading"><p className="form-help">상태와 분과를 함께 선택할 수 있습니다. 등록 동아리를 누르면 전체 목록으로 돌아갑니다.</p><button className="textbtn" type="button" disabled={all} onClick={()=>onChange({...allDirectoryFilters})}>필터 초기화</button></div>{groups.map(group=><div className="directory-filter-group" key={group.key}><h3>{group.label}</h3><div className={'metric-grid metric-filters '+(group.key==='division'?'division-metrics':'')} aria-label={group.label+' 필터'}>{group.options.map(option=>{const selected=option.value==='all'?all:filters[group.key]===option.value;return <button type="button" key={option.value} className={selected?'selected':''} aria-pressed={selected} onClick={()=>onChange(option.value==='all'?{...allDirectoryFilters}:{...filters,[group.key]:selected?'all':option.value})}><span>{option.label}</span><strong>{group.counts[option.value]||0}<small>개</small></strong></button>})}</div></div>)}</section>;
}

export function directoryTitle(filters:DirectorySelection){
 const labels=[filters.account==='PENDING'?'가입 승인 대기':filters.account==='APPROVED'?'정식 대표 계정':'',filters.type==='all'?'':clubTypeLabel(filters.type),filters.division==='all'?'':clubDivisionLabel(filters.division)].filter(Boolean);
 return labels.length?labels.join(' · ')+' 목록':'동아리·대표 계정 목록';
}

export function ClubProfileSummary({profile}:{profile?:Row}){
 const p=profile||blankClubProfile();
 return <dl className="club-details club-profile-summary"><div><dt>동아리 상태</dt><dd><span className={'badge club-type-'+(p.type||'unset')}>{clubTypeLabel(p.type)}</span></dd></div><div><dt>상태 기준일</dt><dd>{p.typeDate?<time dateTime={p.typeDate}>{p.typeDate}</time>:'미지정'}</dd></div><div><dt>분과</dt><dd>{clubDivisionLabel(p.division)}</dd></div><div><dt>회원 수</dt><dd>{p.memberCount===null||p.memberCount===undefined?'미등록':p.memberCount+'명'}</dd></div><div className="advisor-detail"><dt>지도교수</dt><dd>{p.advisor||'미등록'}</dd></div></dl>;
}

export function ClubProfileFields({profile,busy=false}:{profile?:Row,busy?:boolean}){
 const p=profile||blankClubProfile(),[type,setType]=useState(p.type||''),[typeDate,setTypeDate]=useState(p.typeDate||'');
 return <fieldset className="club-profile-fields" disabled={busy}><legend>동아리 상태·분과·운영 정보</legend><label className="field"><span>동아리 상태</span><select name="clubType" value={type} onChange={e=>{setType(e.target.value);setTypeDate(e.target.value?today():'')}}><option value="">미지정</option>{CLUB_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label><label className="field"><span>상태 기준일</span><input name="clubTypeDate" type="date" value={typeDate} max={today()} required={!!type} disabled={busy||!type} onChange={e=>setTypeDate(e.target.value)}/><small>현재 상태를 지정한 날짜입니다. 상태를 바꾸면 오늘 날짜가 제안되며, 이전 기준일로 수정할 수 있습니다.</small></label><label className="field"><span>동아리 분과</span><select name="clubDivision" defaultValue={p.division||''}><option value="">미지정</option>{CLUB_DIVISIONS.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}</select></label><label className="field"><span>회원 수</span><input name="memberCount" type="number" inputMode="numeric" min={0} max={100000} step={1} defaultValue={p.memberCount??''} placeholder="예: 25"/><small>현재 회원 수를 입력합니다. 미확인 시 비워둘 수 있습니다.</small></label><label className="field"><span>지도교수 이름</span><input name="advisor" defaultValue={p.advisor||''} maxLength={40}/></label></fieldset>;
}
