import {randomBytes,scryptSync,createCipheriv,createDecipheriv} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {readFile,writeFile,unlink,mkdir,readdir} from 'node:fs/promises';
import {Writable} from 'node:stream';
import {createInterface} from 'node:readline/promises';
import path from 'node:path';
export async function promptSecret(label){
 const output=new Writable({write(chunk,encoding,done){done()}}),rl=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
 process.stdout.write(label);try{return await rl.question('')}finally{rl.close();process.stdout.write('\n')}
}
export async function backupPasswords(){
 const ask=async label=>{const value=await promptSecret(label+' (12자 이상, 입력은 표시되지 않습니다): ');if(value.length<12||value.length>256)throw new Error('백업 암호는 12~256자로 입력해주세요.');if(value!==await promptSecret('같은 암호를 한 번 더 입력하세요: '))throw new Error('백업 암호 확인이 일치하지 않습니다.');return value};
 const dataPassword=await ask('DB 백업 암호'),keyPassword=await ask('암호화 키 보관용 별도 암호');if(dataPassword===keyPassword)throw new Error('DB 백업과 키 보관 암호는 서로 다르게 설정해주세요.');return {dataPassword,keyPassword};
}
export function encryptBackup(value,password,kind='database'){
 if(typeof password!=='string'||password.length<12||password.length>256)throw new Error('백업 암호는 12~256자로 입력해주세요.');
 const salt=randomBytes(32),iv=randomBytes(12),key=scryptSync(password,salt,32,{N:131072,r:8,p:1,maxmem:256*1024*1024});
 const cipher=createCipheriv('aes-256-gcm',key,iv),aad=Buffer.from('ILA-BACKUP-v1:'+kind);cipher.setAAD(aad);
 const data=Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(value)))),cipher.final()]);key.fill(0);
 return JSON.stringify({format:'ILA-BACKUP-v1',kind,kdf:'scrypt-N131072-r8-p1',salt:salt.toString('hex'),iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:data.toString('base64')});
}
export function decryptBackup(raw,password){
 try{const value=JSON.parse(raw);if(value.format!=='ILA-BACKUP-v1'||!['database','keys'].includes(value.kind)||!['scrypt-N131072-r8-p1','scrypt-N32768-r8-p1'].includes(value.kdf)||!/^[a-f0-9]{64}$/.test(value.salt)||!/^[a-f0-9]{24}$/.test(value.iv)||!/^[a-f0-9]{32}$/.test(value.tag)||typeof value.data!=='string')throw new Error();
 const key=scryptSync(password,Buffer.from(value.salt,'hex'),32,{N:value.kdf==='scrypt-N131072-r8-p1'?131072:32768,r:8,p:1,maxmem:256*1024*1024}),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'hex'));decipher.setAAD(Buffer.from('ILA-BACKUP-v1:'+value.kind));decipher.setAuthTag(Buffer.from(value.tag,'hex'));const data=Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]);key.fill(0);return JSON.parse(gunzipSync(data).toString('utf8'));
 }catch{throw new Error('백업 암호가 올바르지 않거나 백업 파일이 손상되었습니다.')}
}
export async function saveEncryptedBackup(destination,value,password,kind){
 const raw=encryptBackup(value,password,kind);if(JSON.stringify(decryptBackup(raw,password))!==JSON.stringify(value))throw new Error('암호화 백업을 검증하지 못했습니다.');await mkdir(path.dirname(destination),{recursive:true,mode:0o700});await writeFile(destination,raw,{mode:0o600,flag:'wx'});if(JSON.stringify(decryptBackup(await readFile(destination,'utf8'),password))!==JSON.stringify(value))throw new Error('저장된 백업을 검증하지 못했습니다. 기존 파일은 보존합니다.');return destination;
}
export async function encryptedDatabaseBackup(root,wrangler,passwords,stamp){
 const temporary=path.join(root,'.secrets','backup-'+crypto.randomUUID()+'.sql'),destination=path.join(root,'backups',stamp,'database.ila-backup');
 await mkdir(path.dirname(temporary),{recursive:true,mode:0o700});await writeFile(temporary,'',{mode:0o600,flag:'wx'});
 try{await wrangler(['d1','export','DB','--remote','--config','wrangler.json','--output',temporary]);const sql=await readFile(temporary,'utf8');if(!sql.trim())throw new Error('DB 백업이 비어 있습니다. 업데이트를 중단했습니다.');const config=JSON.parse(await readFile(path.join(root,'wrangler.json'),'utf8'));await saveEncryptedBackup(destination,{createdAt:new Date().toISOString(),sql,config},passwords.dataPassword,'database');return destination}finally{await unlink(temporary).catch(()=>{})}
}
export async function encryptedKeyBackup(root,password,stamp){const secrets=JSON.parse(await readFile(path.join(root,'.secrets/runtime.json'),'utf8'));return saveEncryptedBackup(path.join(root,'.secrets','key-backups',stamp+'.ila-keys'),{createdAt:new Date().toISOString(),secrets},password,'keys')}
export async function protectLegacyBackups(root,passwords){
 const base=path.join(root,'backups'),visit=async directory=>{let entries;try{entries=await readdir(directory,{withFileTypes:true})}catch(error){if(error.code==='ENOENT')return;throw error}for(const entry of entries){const file=path.join(directory,entry.name);if(entry.isDirectory())await visit(file);else if(entry.isFile()&&['database.sql','runtime.json'].includes(entry.name)){const raw=await readFile(file,'utf8'),kind=entry.name==='runtime.json'?'keys':'database',password=kind==='keys'?passwords.keyPassword:passwords.dataPassword;const destination=kind==='keys'?path.join(root,'.secrets/key-backups','legacy-'+crypto.randomUUID()+'.ila-keys'):file+'.ila-backup';await saveEncryptedBackup(destination,{originalPath:path.relative(root,file),content:raw},password,kind);await unlink(file)}}};await visit(base);
}
