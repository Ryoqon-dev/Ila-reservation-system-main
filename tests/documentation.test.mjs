import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const sections=['01-overview','02-features','03-architecture','04-file-structure','05-database','06-uiux','07-todo-list'];
async function markdownFiles(directory){
 const files=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const target=path.join(directory,entry.name);
  if(entry.isDirectory())files.push(...await markdownFiles(target));
  else if(entry.isFile()&&entry.name.endsWith('.md'))files.push(target);
 }
 return files;
}
function localLinks(text,file){
 // Markdown links used in these docs: relative file targets, no optional title.
 const prose=text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm,'');
 return [...prose.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map(match=>match[1])
  .filter(target=>!target.startsWith('#')&&!/^[a-z][a-z\d+.-]*:/i.test(target))
  .map(target=>path.resolve(path.dirname(file),decodeURIComponent(target.split('#')[0])));
}

test('documentation has seven indexed sections and no scattered root Markdown',async()=>{
 const readme=await readFile(path.join(root,'README.md'),'utf8');
 assert.deepEqual((await readdir(root)).filter(name=>name.endsWith('.md')).sort(),['AGENTS.md','README.md']);
 assert.deepEqual((await readdir(path.join(root,'docs'))).sort(),sections);
 for(const section of sections){
  assert.ok(readme.includes('docs/'+section+'/README.md'),section);
  const files=await readdir(path.join(root,'docs',section));
  assert.ok(files.includes('README.md'),section+' index');
  assert.ok(files.filter(name=>name.endsWith('.md')).length>=3,section+' multiple topic documents');
 }
});

test('all internal Markdown file links resolve on disk',async()=>{
 const files=[path.join(root,'README.md'),...await markdownFiles(path.join(root,'docs'))];
 const missing=[];
 for(const file of files){
  for(const target of localLinks(await readFile(file,'utf8'),file)){
   try{await stat(target)}catch{missing.push(path.relative(root,file)+' -> '+path.relative(root,target))}
  }
 }
 assert.deepEqual(missing,[]);
});

test('every documentation page is reachable within two links from the root README',async()=>{
 const start=path.join(root,'README.md'),visited=new Set([start]);
 let frontier=[start];
 for(let depth=0;depth<2;depth++){
  const next=[];
  for(const file of frontier){
   for(const target of localLinks(await readFile(file,'utf8'),file)){
    if(target.endsWith('.md')&&!visited.has(target)){visited.add(target);next.push(target)}
   }
  }
  frontier=next;
 }
 const unreachable=(await markdownFiles(path.join(root,'docs'))).filter(file=>!visited.has(file)).map(file=>path.relative(root,file));
 assert.deepEqual(unreachable,[]);
});
