import {createContext,useContext,useEffect,useCallback,useRef,useState,type ReactNode} from 'react';
import {requestJson as api} from './api-client.mjs';
import {kstDate,formatOpeningTime} from '../lib/opening-time.mjs';
type Clock={ready:boolean,error:string,now:()=>number,observe:(stamp:number)=>void,refresh:()=>Promise<void>};
export const ClockContext=createContext<Clock>({ready:false,error:'',now:()=>Date.now(),observe:()=>{},refresh:async()=>{}});
export const useServerClock=()=>useContext(ClockContext);
export function ServerClockProvider({children}:{children:ReactNode}){
 const[ready,setReady]=useState(false),[error,setError]=useState(''),anchor=useRef<{server:number,mono:number}|null>(null),inFlight=useRef<Promise<void>|null>(null),mounted=useRef(true);
 const now=useCallback(()=>anchor.current?anchor.current.server+performance.now()-anchor.current.mono:Date.now(),[]);
 const observe=useCallback((stamp:number)=>{if(Number.isSafeInteger(stamp)&&stamp>0&&mounted.current){anchor.current={server:stamp,mono:performance.now()};setReady(true);setError('')}},[]);
 const refresh=useCallback(()=>{if(inFlight.current)return inFlight.current;const pending=api('serverTime').then(value=>observe(value.serverNow)).catch(error=>{if(mounted.current)setError(error.message)}).finally(()=>{if(inFlight.current===pending)inFlight.current=null});inFlight.current=pending;return pending},[observe]);
 useEffect(()=>{mounted.current=true;void refresh();const resume=()=>{if(document.visibilityState==='visible')void refresh()},interval=setInterval(resume,5*60000);document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume);return()=>{mounted.current=false;clearInterval(interval);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume)}},[refresh]);
 return <ClockContext.Provider value={{ready,error,now,observe,refresh}}>{children}</ClockContext.Provider>;
}
export function useClockTick(){const clock=useServerClock(),[,tick]=useState(0);useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')tick(n=>n+1)},1000);return()=>clearInterval(timer)},[]);return {...clock,stamp:clock.now(),date:kstDate(clock.now())}}
export function ServerTimeLabel(){const clock=useClockTick();return <div className="server-time" aria-label="서버 기준 한국시간"><span className="server-time-dot"/><span>{clock.ready?<>서버 기준 <time>{formatOpeningTime(clock.stamp)}</time></>:clock.error?'한국시간을 확인하지 못했습니다.':'한국시간 확인 중…'}</span>{clock.error&&<button type="button" className="textbtn" onClick={()=>void clock.refresh()}>다시 확인</button>}</div>}
export function OpeningCountdown({opensAt}:{opensAt:number}){const clock=useClockTick(),remaining=Math.max(0,Math.ceil((opensAt-clock.stamp)/1000)),days=Math.floor(remaining/86400),hours=Math.floor(remaining%86400/3600),minutes=Math.floor(remaining%3600/60),seconds=remaining%60;return <div className="opening-countdown"><div><b>예약 오픈 예정</b><span>{formatOpeningTime(opensAt)}</span></div><strong>{!clock.ready?'시간 확인 중':remaining?`${days?days+'일 ':''}${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`:'오픈 상태 확인 중…'}</strong><p>서버의 한국시간으로 접수를 시작합니다. 오픈 시 시간표를 자동으로 다시 확인합니다.</p></div>}
// Only known pending openings trigger background requests. The exact booking gate is server-side.
export function useOpeningRefresh(rows:any[]|undefined,reload:()=>void){
 const clock=useServerClock(),pending=rows?.filter(row=>!row.is_open&&Number.isSafeInteger(row.opens_at)).map(row=>row.opens_at)||[],next=pending.length?Math.min(...pending):null;
 useEffect(()=>{if(!clock.ready||next===null)return;let timer:ReturnType<typeof setTimeout>|null=null;const arm=()=>{if(timer)clearTimeout(timer);if(document.visibilityState!=='visible')return;const wait=Math.max(750,Math.min(60000,next-clock.now()+100));timer=setTimeout(reload,wait)};arm();const resume=()=>{if(document.visibilityState==='visible')reload();else if(timer)clearTimeout(timer)};document.addEventListener('visibilitychange',resume);return()=>{if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',resume)}},[clock.ready,clock.now,next,reload,rows]);
}
