// Every CSV uses this explicit allowlist. Credentials, images and session fields
// are never selected or serialized, even when a record contains extra keys.
export const EXPORT_COLUMNS={
 bookings:[['date','이용 날짜'],['start','시작'],['end','종료'],['room','장소'],['club','동아리'],['club_room','동아리방 호수'],['representative','대표자'],['phone','연락처'],['status','예약 상태'],['entry_photo','입실 사진 확인'],['exit_photo','퇴실 사진 확인']],
 penalties:[['date','발생 날짜'],['club','동아리'],['club_room','동아리방 호수'],['kind','벌점 종류'],['points','차감 점수'],['content','벌점 사유'],['voided','취소 여부'],['semester','학기 마감']],
 audit:[['date','날짜'],['created_at','처리 시각'],['action','작업'],['target','대상']],
 resets:[['date','날짜'],['completed_at','완료 시각'],['label','학기·처리명'],['target_name','대상 동아리'],['total','기록 수'],['points','초기화한 차감 점수']],
 clubs:[['date','수정 날짜'],['name','동아리 이름'],['room','동아리방 호수'],['active','활성 여부']]
};
export const EXPORT_NAMES={bookings:'예약내역',penalties:'벌점내역',audit:'운영기록',resets:'학기마감이력',clubs:'동아리목록'};
const cell=value=>{let s=String(value??'');if(/^\s*[=+@-]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
export function csvDocument(kind,rows){const columns=EXPORT_COLUMNS[kind];if(!columns)throw new Error('내보내기 종류를 확인해주세요.');return '\uFEFF'+[columns.map(([,title])=>cell(title)).join(','),...rows.map(row=>columns.map(([key])=>cell(row[key])).join(','))].join('\r\n')+'\r\n'}
export const DATASETS={
 bookings:{from:'bookings b JOIN clubs c ON c.id=b.club_id',date:'b.date',sort:'b.start',id:'b.id',select:'b.date,b.start,b.end,b.room,c.name AS club,c.room AS club_room,b.representative,b.phone,b.status,b.entry_photo,b.exit_photo',where:'1=1'},
 penalties:{from:'penalty_records p JOIN clubs c ON c.id=p.club_id LEFT JOIN data_jobs j ON j.id=p.reset_id',date:'p.date',sort:'0',id:'p.id',select:"p.date,c.name AS club,c.room AS club_room,p.kind,p.points,p.content,p.voided,CASE WHEN p.reset_id IS NULL THEN '현재 학기' ELSE COALESCE(j.label,'마감 기록') END AS semester",where:'1=1'},
 audit:{from:'audit a',date:'substr(a.created_at,1,10)',sort:'0',id:'a.id',select:'substr(a.created_at,1,10) AS date,a.created_at,a.action,a.target',where:'1=1'},
 resets:{from:'data_jobs j',date:'substr(j.completed_at,1,10)',sort:'0',id:'j.id',select:'substr(j.completed_at,1,10) AS date,j.completed_at,j.label,j.target_name,j.total,j.points',where:"j.action='reset' AND j.completed_at IS NOT NULL"},
 clubs:{from:'clubs c',date:'substr(c.updated_at,1,10)',sort:'0',id:'c.id',select:'substr(c.updated_at,1,10) AS date,c.name,c.room,c.active',where:'1=1'}
};
