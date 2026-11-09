import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {requestJson as api} from './api-client.mjs';
import {initialSiteContent,unionLabel} from '../lib/site-defaults.mjs';
type Row=Record<string,any>;
export const SiteContentContext=createContext<{content:Row,loading:boolean,error:string,accept:(v:Row)=>void,reload:()=>Promise<Row>}>({content:initialSiteContent(),loading:true,error:'',accept:()=>{},reload:async()=>initialSiteContent()});
const Context=SiteContentContext;
export function SiteContentProvider({children}:{children:ReactNode}){
 const[content,setContent]=useState<Row>(initialSiteContent),[loading,setLoading]=useState(true),[error,setError]=useState('');const seq=useRef(0),last=useRef(0);
 const accept=useCallback((value:Row)=>{seq.current++;setContent(value);setLoading(false);setError('');last.current=Date.now()},[]);
 const reload=useCallback(async()=>{const id=++seq.current;try{const value=await api('siteContent');if(id===seq.current){setContent(value);setError('');last.current=Date.now()}return value}catch(e){if(id===seq.current)setError((e as Error).message);throw e}finally{if(id===seq.current)setLoading(false)}},[]);
 useEffect(()=>{reload().catch(()=>{});const focus=()=>{if(Date.now()-last.current>120000)reload().catch(()=>{})};window.addEventListener('focus',focus);return()=>{seq.current++;window.removeEventListener('focus',focus)}},[reload]);
 useEffect(()=>{const s=content.settings;document.title=`${s.brand} · 동아리 통합 관리 시스템`;const description=document.querySelector('meta[name="description"]');description?.setAttribute('content',`${s.institution} ${unionLabel(s)} ${s.brand} 동아리 통합 관리 시스템`);document.querySelector('link[rel="icon"]')?.setAttribute('href',content.images.logo)},[content]);
 return <Context.Provider value={{content,loading,error,accept,reload}}>{children}</Context.Provider>;
}
export function useSiteContent(){const state=useContext(Context);return{...state,site:state.content.settings,images:state.content.images,union:unionLabel(state.content.settings)}}
export function NoticeContents({settings}:{settings:Row}){const notices=settings.notices.filter((n:Row)=>n.enabled);return <div className="rules">{notices.map((n:Row,i:number)=><div key={n.id}><b>{String(i+1).padStart(2,'0')} · {n.title}</b><p className="multiline">{n.body}</p></div>)}{!notices.length&&<p className="muted">현재 표시할 공지가 없습니다.</p>}<a href={settings.contactUrl} target="_blank" rel="noopener noreferrer">문의 오픈채팅 ↗</a></div>}
