import {assert,validDate} from './rules.mjs';
export const kstDateTime=stamp=>new Date(stamp+9*3600000).toISOString().slice(0,19);
export const kstDate=stamp=>kstDateTime(stamp).slice(0,10);
export const formatOpeningTime=stamp=>kstDateTime(stamp).replace('T',' ')+' (한국시간)';
export function parseOpeningTime(value){
 assert(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value),'한국시간 기준 오픈 날짜와 시·분·초를 입력해주세요.');
 const normalized=value.length===16?value+':00':value;validDate(normalized.slice(0,10),true);
 const stamp=Date.parse(normalized+'+09:00');assert(Number.isFinite(stamp)&&kstDateTime(stamp)===normalized,'실제로 존재하는 오픈 날짜와 시간을 입력해주세요.');return stamp;
}
// The SQL clock also checks time at statement execution, including a boundary crossed in flight.
export const openingClock='MAX(?,unixepoch()*1000)';
export function roomOpenSQL(date,room){return `(EXISTS(SELECT 1 FROM openings mo WHERE mo.date=${date} AND mo.room=${room} AND mo.is_open=1) OR EXISTS(SELECT 1 FROM opening_schedule_targets st JOIN opening_schedule_batches sb ON sb.id=st.batch_id WHERE st.date=${date} AND st.room=${room} AND sb.status='ACTIVE' AND sb.opens_at<=${openingClock}))`}
export function openingRows(sql,from,to=from){
 return sql(`SELECT x.date,x.room,CASE WHEN COALESCE(o.is_open,0)=1 OR (b.status='ACTIVE' AND b.opens_at<=${openingClock}) THEN 1 ELSE 0 END AS is_open,
 CASE WHEN b.status='ACTIVE' AND COALESCE(o.is_open,0)=0 THEN b.opens_at ELSE NULL END AS opens_at
 FROM (SELECT date,room FROM openings WHERE date BETWEEN ? AND ? UNION SELECT date,room FROM opening_schedule_targets WHERE date BETWEEN ? AND ?) x
 LEFT JOIN openings o ON o.date=x.date AND o.room=x.room
 LEFT JOIN opening_schedule_targets t ON t.date=x.date AND t.room=x.room
 LEFT JOIN opening_schedule_batches b ON b.id=t.batch_id ORDER BY x.date,x.room`,Date.now(),from,to,from,to);
}
export const cleanOpening=row=>row.opens_at===null?Object.fromEntries(Object.entries(row).filter(([key])=>key!=='opens_at')):row;

export function openingRequestId(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)}
