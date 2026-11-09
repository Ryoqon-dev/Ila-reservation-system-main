import {TimetableCanvas,ReservationTimetable,MainAdminTimeRemaining} from '../src/reservation-timetable';
import {ReaderLogin,ReadOnlyBookingList,ReadAccessManager} from '../src/reservation-read';
import {timetableModel} from '../lib/reservation-timetable.mjs';
import {PhotoSubmissionControl} from '../src/photo-submission';
import {OpeningForm} from '../src/scheduled-openings';
import {ClockContext,OpeningCountdown} from '../src/server-clock';
import {AdminLogin,AdminSecurity,RecoveryCodes} from '../src/admin-security';
import {DirectoryFilters,ClubProfileSummary,ClubProfileFields,allDirectoryFilters} from '../src/club-profile';
// SSR-only semantic checks; no browser or production requests are used.
import {renderToStaticMarkup} from 'react-dom/server';
import {Application,Booking,PenaltyForm,BookingConfirmation} from '../src/App';
import {ClubArea,ClubReport,ClubSessionContext,ClubBookingRecord,ClubEditorDialog} from '../src/accounts';
import {SiteContentContext,NoticeContents} from '../src/site-content';
import {SiteEditor} from '../src/site-editor';
import {CatalogCards,RentalNoticeEditor} from '../src/catalog';
import {FloorPlanCanvas,OfficerFields} from '../src/club-floorplan';
import {FLOORS} from '../lib/floorplan-defaults.mjs';
import {DataManager,SemesterPanel,UsageCard} from '../src/data-manager';
type Row=Record<string,any>;
const state=(content:Row)=>({content,loading:false,error:'',accept:()=>{},reload:async()=>content});
const session=(profile:Row|null)=>({profile,loading:false,error:'',refresh:async()=>{},accept:()=>{}});
export const renderHomeForCheck=(content:Row,profile:Row|null=null)=>renderToStaticMarkup(<SiteContentContext.Provider value={state(content)}><ClubSessionContext.Provider value={session(profile)}><Application/></ClubSessionContext.Provider></SiteContentContext.Provider>);
export const renderNoticesForCheck=(settings:Row)=>renderToStaticMarkup(<NoticeContents settings={settings}/>);
export const renderEditorForCheck=(content:Row)=>renderToStaticMarkup(<SiteContentContext.Provider value={state(content)}><SiteEditor notify={()=>{}}/></SiteContentContext.Provider>);
export const renderClubAreaForCheck=(content:Row,profile:Row|null,mode:string)=>renderToStaticMarkup(<SiteContentContext.Provider value={state(content)}><ClubSessionContext.Provider value={session(profile)}><ClubArea mode={mode} notify={()=>{}} booking={()=><p>예약 화면 표시</p>}/></ClubSessionContext.Provider></SiteContentContext.Provider>);
export const renderReportForCheck=(data:Row)=>renderToStaticMarkup(<ClubReport data={data} page={0} kind="all" setPage={()=>{}} setKind={()=>{}}/>);
export const renderBookingForCheck=(content:Row)=>renderToStaticMarkup(<SiteContentContext.Provider value={state(content)}><Booking profile={{club:'테스트 동아리',clubId:'own'}} notify={()=>{}}/></SiteContentContext.Provider>);

export const renderPenaltyFormForCheck=()=>renderToStaticMarkup(<PenaltyForm clubs={[{id:'club',name:'동아리',room:'301',active:1}]} clubId="club" setClubId={()=>{}} busy={false} setBusy={()=>{}} notify={()=>{}} done={async()=>{}}/>);

export const renderConfirmationForCheck=(booking:Row)=>renderToStaticMarkup(<BookingConfirmation booking={booking}/>);
export const renderBookingRecordForCheck=(booking:Row)=>renderToStaticMarkup(<ClubBookingRecord booking={booking} busy={false} cancel={()=>{}}/>);

export const renderSemesterForCheck=()=>renderToStaticMarkup(<SemesterPanel clubs={[{id:'club-1',name:'테스트 동아리',room:'301',active:1,count:2,points:17}]} resets={[]} prepare={()=>{}}/>);
export const renderUsageForCheck=(value:number|null)=>renderToStaticMarkup(<UsageCard title="DB 저장 용량" value={value} limit={500} unit="MB"/>);
export const renderDataManagerForCheck=()=>renderToStaticMarkup(<DataManager notify={()=>{}}/>);

export const renderCatalogForCheck=()=>renderToStaticMarkup(<CatalogCards entries={[{id:'item',title:'마이크 <script>',body:'구성품 <img src=x>\n이용 안내',image:'/api/system?op=entryImage&id=test'}]}/>);
export const renderFloorForCheck=()=>{const f=FLOORS.find(f=>f.id==='hall-3f')!;return renderToStaticMarkup(<FloorPlanCanvas floor={{...f,spaces:f.spaces.map(s=>({...s,clubIds:[],clubLabels:[],sourceNames:s.clubNames||[]}))}} onSelect={()=>{}}/>)};
export const renderOfficersForCheck=()=>renderToStaticMarkup(<OfficerFields/>);
export const renderRentalNoticesForCheck=(content:Row)=>renderToStaticMarkup(<SiteContentContext.Provider value={state(content)}><RentalNoticeEditor notify={()=>{}}/></SiteContentContext.Provider>);

export const renderDirectoryFiltersForCheck=()=>renderToStaticMarkup(<DirectoryFilters clubs={[{id:'a',name:'공연 동아리',room:'301',active:1,account_status:'APPROVED',profile:{type:'REGULAR',division:'PERFORMANCE'}},{id:'b',name:'봉사 동아리',room:'302',active:1,account_status:'PENDING',profile:{type:'NEW',division:'VOLUNTEER'}}]} archived={false} filters={allDirectoryFilters} onChange={()=>{}}/>);
export const renderClubProfileForCheck=(profile:Row)=>renderToStaticMarkup(<ClubProfileSummary profile={profile}/>);
export const renderClubProfileFieldsForCheck=()=>renderToStaticMarkup(<ClubProfileFields profile={{type:'ASSOCIATE',typeDate:'2026-09-01',division:'SPORTS',memberCount:23,advisor:'검증 교수'}}/>);

export const renderClubEditorForCheck=()=>renderToStaticMarkup(<ClubEditorDialog editing={{id:"test",name:"검증 동아리",room:"301",profile:{version:"initial"}}} notify={()=>{}} done={()=>{}} close={()=>{}}/>);

export const renderAdminLoginForCheck=(content:Row,auth:Row)=>renderToStaticMarkup(<SiteContentContext.Provider value={state(content)}><AdminLogin auth={auth} onSuccess={()=>{}} notify={()=>{}}/></SiteContentContext.Provider>);
export const renderAdminSecurityForCheck=()=>renderToStaticMarkup(<AdminSecurity notify={()=>{}} done={()=>{}}/>);
export const renderRecoveryForCheck=()=>renderToStaticMarkup(<RecoveryCodes codes={Array.from({length:10},(_,i)=>'00000-11111-22222-'+String(i).padStart(5,'0'))} done={()=>{}}/>);

const sampleClock={ready:true,error:'',now:()=>Date.UTC(2026,9,30,3,59,50),observe:()=>{},refresh:async()=>{}};
export const renderOpeningFormForCheck=(mode:'now'|'scheduled'='now')=>renderToStaticMarkup(<ClockContext.Provider value={sampleClock}><OpeningForm initialMode={mode} notify={()=>{}} done={()=>{}}/></ClockContext.Provider>);
export const renderCountdownForCheck=()=>renderToStaticMarkup(<ClockContext.Provider value={sampleClock}><OpeningCountdown opensAt={Date.UTC(2026,9,30,4)}/></ClockContext.Provider>);

export const renderPhotoControlForCheck=(entry_photo:number,exit_photo:number,status='APPROVED')=>renderToStaticMarkup(<PhotoSubmissionControl booking={{entry_photo,exit_photo,status,club:'확인 동아리'}} onChange={()=>{}}/>);

export const renderTimetableForCheck=(rows:Row[])=>renderToStaticMarkup(<TimetableCanvas model={timetableModel(rows,'2026-11-02')}/>);
export const renderFoldedTimetableForCheck=()=>renderToStaticMarkup(<ClockContext.Provider value={sampleClock}><ReservationTimetable/></ClockContext.Provider>);
export const renderReaderLoginForCheck=()=>renderToStaticMarkup(<ReaderLogin done={()=>{}}/>);
export const renderReadListForCheck=(rows:Row[])=>renderToStaticMarkup(<ReadOnlyBookingList rows={rows}/>);
export const renderReadAccessForCheck=()=>renderToStaticMarkup(<ReadAccessManager/>);
export const renderAdminRemainingForCheck=()=>renderToStaticMarkup(<ClockContext.Provider value={sampleClock}><MainAdminTimeRemaining expiresAt={sampleClock.now()+899000}/></ClockContext.Provider>);
