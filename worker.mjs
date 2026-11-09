import {handleApi} from './lib/service.mjs';
const sha = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export default {
 async fetch(request,env){
  // Test deployments require an independent access password before serving any path.
  if(env.SITE_PUBLIC!=='true'){
   let password='';
   try{const header=request.headers.get('authorization')||'';if(header.startsWith('Basic ')){const value=atob(header.slice(6));if(value.startsWith('ila-owner:'))password=value.slice(10)}}catch{}
   if(!env.PRIVATE_PASSWORD||!password||(await sha(password))!==(await sha(env.PRIVATE_PASSWORD)))return new Response('비공개 테스트 사이트입니다.',{status:401,headers:{'WWW-Authenticate':'Basic realm="ILA Private Test", charset="UTF-8"','Cache-Control':'no-store'}});
  }
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/')){
   if(path!=='/api/system')return Response.json({error:'요청한 기능을 찾을 수 없습니다.'},{status:404});
   if(!['GET','POST'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, POST'}});
   if(!env.DB||!/^[a-f0-9]{64}$/.test(env.ROOM_KEY||'')||!/^[a-f0-9]{64}$/.test(env.BOOKING_KEY||'')||!/^[a-f0-9]{64}$/.test(env.PII_KEY||'')||!/^[a-f0-9]{64}$/.test(env.MFA_KEY||''))return Response.json({error:'서버의 데이터베이스 및 보안 설정을 확인해주세요.'},{status:503});
   // Headers supplied by the browser never confer owner/admin privileges.
   const headers=new Headers(request.headers);headers.delete('oai-authenticated-user-email');headers.delete('oai-authenticated-user-id');
   const result=await handleApi(new Request(request,{headers}),env.DB,{roomKey:env.ROOM_KEY,bookingKey:env.BOOKING_KEY,bootstrapToken:env.BOOTSTRAP_TOKEN,piiKey:env.PII_KEY,mfaKey:env.MFA_KEY});
   const securityHeaders=new Headers(result.headers);securityHeaders.set('Strict-Transport-Security','max-age=31536000');securityHeaders.set('X-Content-Type-Options','nosniff');securityHeaders.set('X-Frame-Options','DENY');securityHeaders.set('Referrer-Policy','no-referrer');securityHeaders.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
   return new Response(result.body,{status:result.status,statusText:result.statusText,headers:securityHeaders});
  }
  return env.ASSETS.fetch(request);
 }
};
