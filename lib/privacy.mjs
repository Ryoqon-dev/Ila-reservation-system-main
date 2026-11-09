import {crypt,failure} from './security.mjs';
const prefix='enc:v1:';
export function privacy(config){
 const key=()=>{if(!/^[a-f0-9]{64}$/.test(config.piiKey||''))throw failure('개인정보 암호화 키가 없습니다. 보안 업데이트를 완료해주세요.',503);return config.piiKey};
 const seal=async value=>value?prefix+await crypt(String(value),key()):'';
 const open=async value=>{if(!value)return '';if(typeof value!=='string'||!value.startsWith(prefix))throw failure('개인정보 암호화 전환이 필요합니다. 배포 담당자에게 문의해주세요.',503);return crypt(value.slice(prefix.length),key(),true)};
 const fields=async(row,names)=>{if(!row)return row;const out={...row};for(const name of names)if(Object.hasOwn(out,name))out[name]=await open(out[name]);return out};
 return {seal,open,fields,booking:row=>fields(row,['representative','phone','note','reason']),penalty:row=>fields(row,['content']),contacts:async value=>value?JSON.parse(await open(value)): {}};
}
