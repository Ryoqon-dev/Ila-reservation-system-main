import {CheckCircle2,Camera} from 'lucide-react';
type PhotoBooking={entry_photo:number,exit_photo:number,status:string,club?:string};
export function PhotoSubmissionControl({booking,disabled=false,onChange}:{booking:PhotoBooking,disabled?:boolean,onChange:(sent:boolean)=>void}){
 const submitted=!!booking.entry_photo&&!!booking.exit_photo,partial=!!booking.entry_photo!==!!booking.exit_photo,active=['APPROVED','OVERRIDE'].includes(booking.status);
 const next=submitted?'미제출':'제출',hint=partial?`기존 기록: ${booking.entry_photo?'입실':'퇴실'}만 확인됨`:`누르면 ${next}로 변경`;
 return <div className="photo-controls"><button type="button" className={'btn photo-submission-toggle '+(submitted?'confirmed':'secondary')} aria-pressed={submitted} aria-label={`${booking.club||'예약'} 사진 ${submitted?'제출':'미제출'} · 누르면 입실·퇴실 함께 ${next}로 변경`} title={`입실·퇴실 사진을 함께 ${next}로 변경`} disabled={disabled||!active} onClick={()=>onChange(!submitted)}>{submitted?<CheckCircle2 size={17}/>:<Camera size={17}/>}사진 {submitted?'제출':'미제출'}</button><small className="photo-submission-help">{hint}</small></div>;
}
