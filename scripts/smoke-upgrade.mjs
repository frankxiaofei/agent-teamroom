import {_electron as electron} from 'playwright';
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {resolve,join,relative,isAbsolute} from 'node:path';
import assert from 'node:assert/strict';

// An opt-in local regression test: upgrades only the workspace-owned 0.2 smoke install.
const root=resolve('.smoke-data'),installed=resolve(root,'installed-0.2.0'),data=resolve(root,'installed-data');
const version=JSON.parse(readFileSync('package.json','utf8')).version;
for(const path of [installed,data]){const sub=relative(root,path);assert.ok(sub&&!sub.startsWith('..')&&!isAbsolute(sub));}
const executablePath=join(installed,'Teamroom.exe'),installer=resolve(`release/Teamroom-Setup-${version}-x64.exe`);
assert.ok(existsSync(executablePath)&&existsSync(installer)&&existsSync(join(data,'teamroom.db')),'Requires the previous workspace-owned 0.2 install and database.');
const dbVersion=file=>{const db=new DatabaseSync(file,{readOnly:true});try{return db.prepare('PRAGMA user_version').get().user_version;}finally{db.close();}};
assert.equal(dbVersion(join(data,'teamroom.db')),2,'Use an untouched 0.2 database.');
mkdirSync('.build-temp',{recursive:true});
const env={...process.env,TEAMROOM_DATA_DIR:data,TEMP:resolve('.build-temp'),TMP:resolve('.build-temp')};delete env.ELECTRON_RUN_AS_NODE;
const args=process.env.TEAMROOM_SMOKE_NO_SANDBOX==='1'?['--no-sandbox','--disable-gpu']:[];
let app;
try{
  app=await electron.launch({executablePath,args,env});let page=await app.firstWindow();await page.getByRole('heading',{name:'Agent 工作群',exact:true}).waitFor();
  assert.equal(await app.evaluate(({app})=>app.getVersion()),'0.2.0');
  await page.evaluate(async()=>{const state=await window.teamroom.snapshot();await window.teamroom.reporting({...state.reporting,notifications:false});await window.teamroom.report();await window.teamroom.discuss({id:crypto.randomUUID(),question:'验证跨版本升级保留讨论',participants:['codex']});});
  await page.waitForFunction(async()=>(await window.teamroom.snapshot()).discussions.some(d=>d.question==='验证跨版本升级保留讨论'&&d.status==='needs_decision'));
  const before=await page.evaluate(()=>window.teamroom.snapshot());assert.ok(before.tasks.length&&before.accounts.length&&before.reports.length&&before.discussions.length);
  await app.close();app=undefined;
  await new Promise((accept,reject)=>{
    const child=spawn(installer,['/S','/currentuser',`/D=${installed}`],{env,windowsHide:true,shell:false,stdio:'ignore'});
    const timer=setTimeout(()=>{child.kill();reject(new Error('Workspace installer exceeded 90 seconds'));},90000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?accept():reject(new Error('Installer exit '+code));});
  });
  app=await electron.launch({executablePath,args,env});page=await app.firstWindow();await page.getByRole('heading',{name:'Agent 工作群',exact:true}).waitFor();
  assert.equal(await app.evaluate(({app})=>app.getVersion()),version);
  const after=await page.evaluate(()=>window.teamroom.snapshot());
  for(const key of ['tasks','accounts','reports','discussions'])for(const row of before[key])assert.deepEqual(after[key].find(item=>item.id===row.id),row,`${key} record ${row.id} must survive`);
  assert.deepEqual(after.bills,[]);await app.close();app=undefined;
  assert.equal(dbVersion(join(data,'teamroom.db')),3);
  const backup=readdirSync(data).find(name=>name.startsWith('teamroom.db.before-v3-')&&name.endsWith('.db'));assert.ok(backup);assert.equal(dbVersion(join(data,backup)),2);
  const proof={from:'0.2.0',to:version,manualInstaller:true,schemaBefore:2,schemaAfter:3,migrationBackupSchema:2,preserved:Object.fromEntries(['tasks','accounts','reports','discussions'].map(key=>[key,before[key].length])),signedAutoUpdate:false};
  writeFileSync(join(root,'upgrade-proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await app?.close();}
