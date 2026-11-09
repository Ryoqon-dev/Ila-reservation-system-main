import {readFile,writeFile,mkdir,unlink,rename} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {privacy} from '../lib/privacy.mjs';
const quote=value=>value===null?'NULL':"'"+String(value).replaceAll("'","''")+"'";
export async function ensureSecurityKeys(root){const file=path.join(root,'.secrets/runtime.json'),secrets=JSON.parse(await readFile(file,'utf8'));for(const key of ['ROOM_KEY','BOOKING_KEY'])if(!/^[a-f0-9]{64}$/.test(secrets[key]||''))throw new Error('기존 보안 키 형식을 확인해주세요. 키를 새로 만들거나 변경하지 마세요.');let changed=false;for(const key of ['PII_KEY','MFA_KEY'])if(!secrets[key]){secrets[key]=randomBytes(32).toString('hex');changed=true}else if(!/^[a-f0-9]{64}$/.test(secrets[key]))throw new Error('보안 키 형식이 올바르지 않습니다: '+key);if(changed){const temporary=file+'.'+crypto.randomUUID()+'.tmp';try{await writeFile(temporary,JSON.stringify(secrets,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temporary,file)}finally{await unlink(temporary).catch(()=>{})}}return secrets}
export async function migrationUpdates(tables,secrets){
 const secure=privacy({piiKey:secrets.PII_KEY}),statements=[];
 const plan=[['club_contacts','club_id',['contacts']],['club_profiles','club_id',['advisor']],['bookings','id',['representative','phone','note','reason']],['penalties','id',['content']]];
 for(const [table,id,columns]of plan)for(const row of tables[table]||[]){const changes=[];for(const column of columns){const value=row[column];if(value&&!String(value).startsWith('enc:v1:'))changes.push(column+'='+quote(await secure.seal(value)));else if(value)await secure.open(value)}if(changes.length)statements.push('UPDATE '+table+' SET '+changes.join(',')+' WHERE '+id+'='+quote(row[id])+';')}
 return statements;
}
export function parseWranglerJson(output){let value;try{value=JSON.parse(String(output).trim())}catch{throw new Error('Cloudflare 조회 결과를 안전하게 읽지 못했습니다. 기존 데이터는 삭제하지 않았습니다.')}if(!Array.isArray(value)||value.some(v=>v.success===false||!Array.isArray(v.results)))throw new Error('Cloudflare DB 조회에 실패했습니다.');return value.flatMap(v=>v.results)}
export async function migratePrivacy(root,wrangler,secrets){
 const tables={},plan=[['club_contacts','club_id','contacts'],['club_profiles','club_id','advisor'],['bookings','id','representative,phone,note,reason'],['penalties','id','content']];
 // The new Worker returns 503 while ready=0, so there are no concurrent business writes.
 const state=parseWranglerJson(await wrangler(['d1','execute','DB','--remote','--config','wrangler.json','--command','SELECT ready FROM privacy_state WHERE id=1','--json'],true));
 if(state[0]?.ready===1)return {alreadyReady:true};
 for(const [table,id,columns]of plan){tables[table]=[];let last='';for(;;){const command='SELECT '+id+','+columns+' FROM '+table+' WHERE '+id+'>'+quote(last)+' ORDER BY '+id+' LIMIT 200';const rows=parseWranglerJson(await wrangler(['d1','execute','DB','--remote','--config','wrangler.json','--command',command,'--json'],true));tables[table].push(...rows);if(rows.length<200)break;last=rows.at(-1)[id]}}
 const statements=await migrationUpdates(tables,secrets),temporary=path.join(root,'.secrets','encrypted-migration-'+crypto.randomUUID()+'.sql');
 try{for(let offset=0;offset<statements.length;offset+=100){await writeFile(temporary,statements.slice(offset,offset+100).join('\n'),{mode:0o600});await wrangler(['d1','execute','DB','--remote','--config','wrangler.json','--file',temporary,'--yes'])}
 const remaining=plan.map(([table,,columns])=>columns.split(',').map(column=>`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}<>'' AND ${column} NOT LIKE 'enc:v1:%'`)).flat().join(';');const check=parseWranglerJson(await wrangler(['d1','execute','DB','--remote','--config','wrangler.json','--command',remaining,'--json'],true));if(check.length!==7||check.some(r=>r.n!==0))throw new Error('개인정보 암호화 검증이 완료되지 않았습니다. 같은 업데이트를 다시 실행해주세요.');
 await wrangler(['d1','execute','DB','--remote','--config','wrangler.json','--command',"UPDATE club_accounts SET password_cipher=''; UPDATE privacy_state SET ready=1 WHERE id=1;",'--yes']);return {encryptedRows:statements.length};
 }finally{await unlink(temporary).catch(()=>{})}
}
