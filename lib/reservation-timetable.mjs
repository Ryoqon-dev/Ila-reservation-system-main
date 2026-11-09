import {ROOMS,hm} from './rules.mjs';
export const TABLE_START=540,TABLE_END=1260;
export function timetableModel(rows,date,rooms=ROOMS){
 const allowed=ROOMS.filter(room=>rooms.includes(room));
 const bookings=(rows||[]).filter(row=>row.date===date&&allowed.includes(row.room)&&['APPROVED','OVERRIDE'].includes(row.status)&&Number.isInteger(row.start)&&Number.isInteger(row.end)&&row.start<row.end&&row.end>TABLE_START&&row.start<TABLE_END).map(row=>({room:row.room,club:String(row.club),start:Math.max(TABLE_START,row.start),end:Math.min(TABLE_END,row.end)})).sort((a,b)=>ROOMS.indexOf(a.room)-ROOMS.indexOf(b.room)||a.start-b.start||a.end-b.end||a.club.localeCompare(b.club));
 return {date,rooms:allowed,bookings};
}
export const timetableSummary=model=>model.bookings.map(row=>`${row.room} ${hm(row.start)}~${hm(row.end)} ${row.club}`).join(', ');
export function remainingSession(deadline,now){const seconds=Math.max(0,Math.ceil((deadline-now)/1000));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
