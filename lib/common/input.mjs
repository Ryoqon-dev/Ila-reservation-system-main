export function assert(value,message){if(!value)throw new Error(message)}
export function normalizedName(s){return s.normalize('NFKC').replace(/\s+/g,'').toLowerCase()}
export function field(value,label,max=100){assert(typeof value==='string'&&value.trim().length>0&&value.trim().length<=max,label+'을(를) 입력하세요. (최대 '+max+'자)');return value.trim()}
export function phoneValue(v){assert(typeof v==='string'&&/^\d{10,11}$/.test(v),'전화번호는 하이픈 없이 숫자 10~11자리로 입력하세요.');return v}
export function csvCell(v){let s=String(v??'');if(/^\s*[=+@-]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
