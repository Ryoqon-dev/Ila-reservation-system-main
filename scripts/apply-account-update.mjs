import {backupPasswords,encryptedDatabaseBackup,encryptedKeyBackup,protectLegacyBackups} from './secure-backup.mjs';
import {ensureSecurityKeys,migratePrivacy} from './security-migration.mjs';
import {readFile,writeFile,mkdir,copyFile,readdir,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createInterface} from 'node:readline/promises';
import {spawn} from 'node:child_process';
const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
async function exists(file){try{await access(file);return true}catch{return false}}
async function filesIn(directory,prefix=''){
 const files=[];for(const entry of await readdir(directory,{withFileTypes:true})){const relative=path.join(prefix,entry.name);if(entry.isDirectory())files.push(...await filesIn(path.join(directory,entry.name),relative));else if(entry.isFile())files.push(relative)}return files;
}
export async function applyUpdate(target,{deploy=false,run,install,securityPasswords,log=console.log}={}){
 const root=path.resolve(target),configPath=path.join(root,'wrangler.json');
 if(!await exists(configPath))throw new Error('입력한 폴더에 wrangler.json이 없습니다. 이번 ZIP의 새 폴더가 아니라, 예전에 실제 배포했던 폴더를 입력해주세요. wrangler.example.json은 배포 설정 파일이 아닙니다. 파일은 아직 변경하지 않았습니다.');
 const config=JSON.parse(await readFile(configPath,'utf8'));
 if(config.name!=='ila-club-management'||!config.d1_databases?.some(db=>db.binding==='DB'&&db.database_id&&db.database_id!=='00000000-0000-4000-8000-000000000000'))throw new Error('기존 일아 사이트의 배포 폴더가 아닙니다. wrangler.json이 있는 원래 폴더를 선택해주세요.');
 const binding=config.d1_databases.find(db=>db.binding==='DB');
 if((binding.migrations_dir||'migrations')!=='migrations'||(config.main&&config.main!=='worker.mjs')||(config.assets?.directory&&!['dist','./dist'].includes(config.assets.directory)))throw new Error('기존 배포 파일 경로가 표준 구성과 다릅니다. 설정을 확인하기 전에는 자동 업데이트하지 않습니다.');
 if(!await exists(path.join(root,'.secrets/runtime.json')))throw new Error('기존 보안 키 파일을 찾지 못했습니다. .secrets가 있는 원래 배포 폴더를 선택해주세요.');
 const cli=path.join(root,'node_modules/wrangler/bin/wrangler.js');
 if(deploy&&!run&&!await exists(cli))throw new Error('기존 배포 도구를 찾지 못했습니다. node_modules가 있는 원래 배포 폴더를 선택해주세요. 파일은 아직 변경하지 않았습니다.');
 if(deploy&&path.resolve(sourceRoot)===root)throw new Error('수정본을 기존 배포 폴더와 다른 폴더에 압축 해제한 뒤 실행해주세요. 기존 폴더를 덮어쓰지 마세요.');
 const files=['public/_headers','worker.mjs','index.html','package.json','package-lock.json','README.md','THIRD_PARTY_NOTICES.txt','BACKUP_DATA.cmd','RESTORE_BACKUP.cmd','APPLY_SITE_UPDATE.cmd','APPLY_ACCOUNT_UPDATE.cmd','APPLY_REVIEW_UPDATE.cmd'];
 for(const directory of ['lib','src','migrations','scripts','tests','dist','docs'])files.push(...(await filesIn(path.join(sourceRoot,directory))).map(file=>path.join(directory,file)));
 for(const file of files)if(!await exists(path.join(sourceRoot,file)))throw new Error('업데이트 파일이 누락되었습니다. ZIP을 다시 압축 해제해주세요: '+file);
 const stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-')+'-'+Math.random().toString(16).slice(2,8);
 const backup=path.join(root,'backups','site-update-'+stamp);await mkdir(backup,{recursive:true,mode:0o700});
 const wrangler=run||((args,capture=false)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[cli,...args],{cwd:root,stdio:capture?['inherit','pipe','inherit']:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  let output='';if(capture)child.stdout.on('data',d=>output+=d);
  child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error('Cloudflare 명령에 실패했습니다. 위 오류를 확인하고 같은 업데이트를 다시 실행해주세요.')));
 }));
 let passwords;
 if(deploy){
  passwords=securityPasswords||await backupPasswords();if(passwords.dataPassword===passwords.keyPassword)throw new Error('DB와 키 백업 암호는 서로 다르게 설정해주세요.');
  log('1/6 기존 DB를 암호화해 백업합니다. 키는 별도 암호로 분리 보관합니다.');
  await encryptedDatabaseBackup(root,wrangler,passwords,'site-update-'+stamp);
  await protectLegacyBackups(root,passwords);
 }
 log(deploy?'2/6 기존 소스를 보관하고 동아리 통합 관리 수정본을 적용합니다.':'기존 소스를 보관하고 파일을 적용합니다.');
 const manifest=[];
 for(const file of files){
  const source=path.join(sourceRoot,file),destination=path.join(root,file);if(source===destination)continue;
  const previous=await exists(destination);if(previous){const saved=path.join(backup,file);await mkdir(path.dirname(saved),{recursive:true});await copyFile(destination,saved)}
  await mkdir(path.dirname(destination),{recursive:true});await copyFile(source,destination);manifest.push({file,previous});
 }
 await writeFile(path.join(backup,'manifest.json'),JSON.stringify({release:'reservation-read-access-v1',files:manifest},null,2)+'\n');
 // Never overwrite deployment identity, keys, database IDs, account credentials or audience.
 if(deploy){
  log('3/6 배포 도구의 보안 수정 버전을 설치합니다.');
  if(install)await install(root);else if(!run)await new Promise((resolve,reject)=>{const command=process.platform==='win32'?'cmd.exe':'npm';const args=process.platform==='win32'?['/d','/s','/c','npm ci']:['ci'];const child=spawn(command,args,{cwd:root,stdio:'inherit',env:process.env});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('배포 도구 설치에 실패했습니다. 같은 업데이트를 다시 실행해주세요.'))) });
  const secrets=await ensureSecurityKeys(root);await encryptedKeyBackup(root,passwords.keyPassword,'security-'+stamp);
  log('4/6 필요한 테이블을 준비하고 서버에 보안 키를 등록합니다.');
  await wrangler(['d1','migrations','apply','DB','--remote','--config','wrangler.json']);
  await wrangler(['secret','bulk','.secrets/runtime.json','--config','wrangler.json']);
  log('5/6 같은 사이트에 배포합니다. 개인정보 암호화가 끝날 때까지 API가 잠시 대기합니다.');
  await wrangler(['deploy','--config','wrangler.json']);
  log('6/6 기존 개인정보를 암호화하고 결과를 검증한 뒤 서비스를 엽니다.');
  await migratePrivacy(root,wrangler,secrets);
  log('예약 조회 계정·링크·시간표 업데이트 완료. 기존 '+(config.vars?.SITE_PUBLIC==='true'?'공개':'비공개')+' 설정과 기존 예약을 유지했습니다. 관리자 → 장소대여 → 예약 목록 하단에서 시간표와 조회 권한을 관리하세요.');
  log('DB 백업: backups / 키 백업: .secrets/key-backups. 두 암호와 키 백업은 따로 안전하게 보관하세요.');
 }else log('파일만 적용했습니다. DB 변경과 운영 배포는 아직 실행하지 않았습니다.');
 return{root,backup,public:config.vars?.SITE_PUBLIC==='true',count:manifest.length};
}
export async function runUpdateCLI(){
 let target='';const index=process.argv.indexOf('--target');if(index>=0)target=process.argv[index+1]||'';
 if(!target){const prompt=createInterface({input:process.stdin,output:process.stdout});try{target=await prompt.question('기존 배포 폴더 경로를 붙여넣고 Enter를 누르세요: ')}finally{prompt.close()}}
 target=target.trim().replace(/^"|"$/g,'');if(!target)throw new Error('기존 배포 폴더 경로가 필요합니다.');
 await applyUpdate(target,{deploy:process.argv.includes('--deploy')});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runUpdateCLI().catch(error=>{console.error(error.message);process.exitCode=1});
