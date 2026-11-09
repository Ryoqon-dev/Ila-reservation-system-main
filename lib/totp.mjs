// RFC 4226 / RFC 6238. SHA-1 / 6 digits / 30 seconds for authenticator compatibility.
import {equal} from './security.mjs';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes){let bits=0,value=0,result='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){result+=alphabet[(value>>>(bits-5))&31];bits-=5}}if(bits)result+=alphabet[(value<<(5-bits))&31];return result}
export function decode32(value){if(typeof value!=='string'||!/^[A-Z2-7]{16,128}$/.test(value))throw new Error('인증앱 설정을 확인해주세요.');let bits=0,n=0,out=[];for(const ch of value){n=(n<<5)|alphabet.indexOf(ch);bits+=5;if(bits>=8){out.push((n>>>(bits-8))&255);bits-=8}}return new Uint8Array(out)}
export const newTotpSecret=()=>base32(crypto.getRandomValues(new Uint8Array(20)));
export async function hotp(secret,step,digits=6,algorithm='SHA-1'){
 const counter=new Uint8Array(8);new DataView(counter.buffer).setBigUint64(0,BigInt(step));
 const key=await crypto.subtle.importKey('raw',decode32(secret),{name:'HMAC',hash:algorithm},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,counter)),offset=bytes.at(-1)&15;
 const number=((bytes[offset]&127)<<24)|(bytes[offset+1]<<16)|(bytes[offset+2]<<8)|bytes[offset+3];
 return String(number%10**digits).padStart(digits,'0');
}
export const totp=(secret,stamp=Date.now())=>hotp(secret,Math.floor(stamp/30000));
export async function verifyTotp(secret,code,lastStep=-1,stamp=Date.now()){
 if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;
 const current=Math.floor(stamp/30000);let found=null;
 for(const step of [current,current-1,current+1])if(step>=0&&step>lastStep&&equal(await hotp(secret,step),code))found=step;
 return found;
}
export function authenticatorUri(secret,username){return 'otpauth://totp/'+encodeURIComponent('ILA 관리자:'+username)+'?'+new URLSearchParams({secret,issuer:'ILA 관리자',algorithm:'SHA1',digits:'6',period:'30'})}
