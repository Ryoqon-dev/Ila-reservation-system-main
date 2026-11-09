import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import path from 'node:path';
import {promptSecret,decryptBackup} from './secure-backup.mjs';
try{
 const prompt=createInterface({input:process.stdin,output:process.stdout});let file;
 try{file=(await prompt.question('복호화할 .ila-backup 또는 .ila-keys 파일 경로: ')).trim().replace(/^"|"$/g,'')}finally{prompt.close()}
 const password=await promptSecret('이 파일의 백업 암호 (입력은 표시되지 않습니다): '),value=decryptBackup(await readFile(file,'utf8'),password);
 const destination=path.join(path.dirname(path.resolve(file)),'recovered-'+Date.now());await mkdir(destination,{mode:0o700});
 if(value.sql)await writeFile(path.join(destination,'database.sql'),value.sql,{mode:0o600,flag:'wx'});
 if(value.config)await writeFile(path.join(destination,'wrangler.json'),JSON.stringify(value.config,null,2),{mode:0o600,flag:'wx'});
 if(value.secrets)await writeFile(path.join(destination,'runtime.json'),JSON.stringify(value.secrets,null,2),{mode:0o600,flag:'wx'});
 if(value.originalPath)await writeFile(path.join(destination,path.basename(value.originalPath)),value.content,{mode:0o600,flag:'wx'});
 console.log('복호화 완료: '+destination+'\n이 폴더에는 원문 정보가 포함됩니다. 복구 작업 후 안전하게 정리하세요. 운영 DB에는 아직 적용하지 않았습니다.');
}catch(error){console.error(error.message);process.exitCode=1}
