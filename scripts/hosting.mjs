import {backupPasswords,encryptedDatabaseBackup,encryptedKeyBackup,protectLegacyBackups} from './secure-backup.mjs';
import {ensureSecurityKeys,migratePrivacy} from './security-migration.mjs';
import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const cli=path.join(root,'node_modules/wrangler/bin/wrangler.js');
const configPath=path.join(root,'wrangler.json');
const secretPath=path.join(root,'.secrets/runtime.json');
async function exists(p){try{await access(p);return true}catch{return false}}
async function wrangler(args,capture=false){
 if(!await exists(cli))throw new Error('먼저 이 폴더에서 npm install 을 실행해주세요.');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[cli,...args],{cwd:root,stdio:capture?['inherit','pipe','inherit']:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  let output='';if(capture)child.stdout.on('data',d=>output+=d);
  child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error('Cloudflare 명령이 실패했습니다. 계정과 위 오류를 확인해주세요.')));
 });
}
async function loadConfig(){if(!await exists(configPath))throw new Error('먼저 npm run prepare:hosting 을 실행해주세요.');return JSON.parse(await readFile(configPath,'utf8'))}
async function saveConfig(config){await writeFile(configPath,JSON.stringify(config,null,2)+'\n')}
async function prepare(){
 console.log('Cloudflare 로그인 후 Workers Free 요금제를 유지하세요. 이 명령은 공개 주소를 활성화하지 않습니다.');
 await wrangler(['login']);
 await wrangler(['whoami']);
 let config;
 if(await exists(configPath))config=await loadConfig();
 else{
  config=JSON.parse(await readFile('wrangler.example.json','utf8'));
  const output=await wrangler(['d1','create','ila-club-db'],true);
  const match=output.match(/database_id["\s]*[:=]\s*"([a-f0-9-]{36})"/i);
  if(!match)throw new Error('생성한 DB ID를 자동으로 읽지 못했습니다. Cloudflare의 D1에서 ID를 확인해 wrangler.example.json을 wrangler.json으로 복사한 뒤 database_id에 입력하세요. DB를 다시 만들지 마세요.');
  config.d1_databases[0].database_id=match[1];
 }
 if(config.vars.SITE_PUBLIC==='true')throw new Error('이미 공개된 구성입니다. 기존 공개 운영을 임의로 변경하지 않습니다.');
 config.workers_dev=false;config.preview_urls=false;config.assets.run_worker_first=true;
 await saveConfig(config);
 await mkdir('.secrets',{recursive:true,mode:0o700});
 if(!await exists(secretPath)){
  const secrets=Object.fromEntries(['ROOM_KEY','BOOKING_KEY','BOOTSTRAP_TOKEN','PRIVATE_PASSWORD','PII_KEY','MFA_KEY'].map(key=>[key,randomBytes(32).toString('hex')]));
  await writeFile(secretPath,JSON.stringify(secrets,null,2)+'\n',{mode:0o600,flag:'wx'});
  await writeFile('.secrets/setup-info.txt',`일아 비공개 테스트 설정\n외부 공유 및 업로드 금지\n\n사이트 접속 아이디: ila-owner\n사이트 접속 비밀번호: ${secrets.PRIVATE_PASSWORD}\n최초 관리자 설정 키: ${secrets.BOOTSTRAP_TOKEN}\n\nROOM_KEY와 BOOKING_KEY는 runtime.json에 있습니다. 파일을 안전하게 백업하고 키를 임의로 변경하지 마세요.\n`,{mode:0o600,flag:'wx'});
 }
 await ensureSecurityKeys(root);
 await wrangler(['d1','migrations','apply','DB','--remote','--config','wrangler.json']);
 await wrangler(['deploy','--config','wrangler.json']);
 await wrangler(['secret','bulk','.secrets/runtime.json','--config','wrangler.json']);
 await migratePrivacy(root,wrangler,JSON.parse(await readFile(secretPath,'utf8')));
 console.log('비공개 서버와 DB 준비 완료. 공개 주소는 아직 꺼져 있습니다. 다음 단계: npm run publish:private');
}
async function publish(isPublic){
 const config=await loadConfig();
 if(!await exists(secretPath))throw new Error('보안 키 파일이 없습니다. 기존 키를 복원하거나 최초 준비를 완료해주세요.');
 if(isPublic&&!process.argv.includes('--approved'))throw new Error('공개 승인이 필요합니다. 승인 후 npm run publish:public -- --approved 로 실행하세요.');
 config.workers_dev=true;config.preview_urls=false;config.vars.SITE_PUBLIC=isPublic?'true':'false';
 config.assets.run_worker_first=isPublic?['/api/*']:true;
 await saveConfig(config);
 await wrangler(['deploy','--config','wrangler.json']);
 console.log(isPublic?'공개 배포 완료. 관리자·동아리 로그인과 기존 예약은 유지됩니다.':'비밀번호가 걸린 테스트 배포 완료. 접속 정보는 .secrets/setup-info.txt에서 확인하세요.');
}
async function backup(){
 await loadConfig();const passwords=await backupPasswords(),stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
 await encryptedDatabaseBackup(root,wrangler,passwords,stamp);await encryptedKeyBackup(root,passwords.keyPassword,stamp);await protectLegacyBackups(root,passwords);
 console.log('암호화 DB 백업은 backups에, 별도 암호의 키 백업은 .secrets/key-backups에 저장했습니다. 두 암호를 잊으면 복구할 수 없습니다.');
}

try{
 const mode=process.argv[2];
 if(mode==='prepare')await prepare();else if(mode==='private')await publish(false);else if(mode==='public')await publish(true);else if(mode==='backup')await backup();else throw new Error('사용법: node scripts/hosting.mjs prepare|private|public|backup');
}catch(error){console.error(error.message);process.exitCode=1}
