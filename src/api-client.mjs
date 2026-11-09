export function sessionExpired(scope='admin'){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('ila-session-expired',{detail:{scope}}))}
export async function fetchWithTimeout(url,init={},options={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),options.timeoutMs??20000);
 try{return await (options.fetchImpl||fetch)(url,{...init,signal:controller.signal})}
 catch(error){if(error?.name==='AbortError')throw new Error('서버 응답이 지연되고 있습니다. 같은 내용으로 다시 시도해주세요.');throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 같은 내용으로 다시 시도해주세요.')}
 finally{clearTimeout(timer)}
}
export async function requestJson(op,p={},post=false,options={}){
 const url=post?(['saveSiteContent','saveCatalogEntry'].includes(op)?'/api/system?op='+op:'/api/system'):'/api/system?'+new URLSearchParams({op,...p});
 const response=await fetchWithTimeout(url,{method:post?'POST':'GET',headers:post?{'Content-Type':'application/json'}:{},body:post?JSON.stringify({op,...p}):undefined,cache:'no-store'},options);
 let data;
 try{data=await response.json()}catch{throw new Error('서버 응답을 처리하지 못했습니다. 잠시 후 같은 내용으로 다시 시도해주세요.')}
 if(response.status===401&&!['login','clubLogin','readerLogin'].includes(op))(options.onSessionExpired||sessionExpired)(data.scope||'admin');
 if(!response.ok){if(response.status===423&&data.scope==='rental'&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('ila-rental-blocked'));throw new Error(typeof data?.error==='string'?data.error:'요청을 처리하지 못했습니다.');}
 return data;
}
