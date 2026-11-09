export const RENTAL_VIEWS=['booking','equipment','board'];
export const viewFromQuery=value=>value==='account'?'club':['guide','booking','equipment','board','club','admin','reservations'].includes(value)?value:'home';
export function rentalNotice(view,settings){
 if(view==='booking')return {title:settings.noticeTitle,notices:settings.notices.filter(n=>n.enabled)};
 if(view==='equipment')return {title:settings.equipmentNoticeTitle,body:settings.equipmentNoticeBody};
 if(view==='board')return {title:settings.boardNoticeTitle,body:settings.boardNoticeBody};
 return null;
}
