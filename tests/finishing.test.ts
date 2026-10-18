import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseBills,mergeBills,BILL_TEMPLATE} from '../core/billing.js';
import {selectUpdate,checkUpdates,validReleasePage} from '../core/updates.js';
import {WorkBuddyRun,workBuddyArgs} from '../core/workbuddy.js';
import {cursorWindowsCommand} from '../core/commands.js';
import {installSignedUpdate,trustedSignature} from '../core/signed-update.js';
import {Store,SCHEMA_VERSION} from '../core/store.js';
import {Teamroom} from '../core/service.js';
import {restoreStore,validatedBackup} from '../core/backup.js';
import type {Task} from '../core/types.js';
const csv=BILL_TEMPLATE+'inv-001,2026-10-18,0.10,USD,"one, two"\r\ninv-002,2026-10-18,-0.03,USD,"refund ""ok"""\r\n';
test('bill CSV preserves decimal cents, refunds, quotes and provenance',()=>{
  const bills=parseBills('\uFEFF'+csv,'account-001','Shared','bills.csv',1);assert.equal(bills[0].amountCents,10);assert.equal(bills[1].amountCents,-3);assert.equal(bills[0].description,'one, two');assert.equal(bills[1].description,'refund "ok"');assert.equal(bills[0].source,'csv');
  assert.deepEqual(mergeBills(bills,parseBills(csv,'account-001','Renamed','second.csv',2)).added,0);assert.equal(mergeBills([],bills).duplicates,0);assert.throws(()=>mergeBills(bills,[{...bills[0],amountCents:11}]),/冲突/);
});
test('bill import rejects malformed dates, amounts, quotes, headers and oversized input',()=>{
  for(const text of [BILL_TEMPLATE,BILL_TEMPLATE+'x,2026-02-30,1,USD,test',BILL_TEMPLATE+'x,2026-10-18,NaN,USD,test',BILL_TEMPLATE+'x,2026-10-18,1.001,USD,test',BILL_TEMPLATE+'x,2026-10-18,1,EUR,test',BILL_TEMPLATE+'x,2026-10-18,1,USD,"unterminated','bad\nrow','a'.repeat(1024*1024+1)])assert.throws(()=>parseBills(text,'account-001','Shared','bills.csv'));
});
test('bill service imports atomically, deduplicates across tools and survives backup/restore',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'teamroom-bills-'));let store=new Store(join(dir,'db.db'));const room=new Teamroom(store);
  try{room.account({id:'account-001',label:'Shared',tools:['codex','claude'],state:'unknown',currency:'USD',source:'manual',updatedAt:1});assert.equal(room.importBills('account-001',csv,'bills.csv').added,2);assert.equal(room.importBills('account-001',csv,'bills.csv').duplicates,2);assert.throws(()=>room.importBills('account-001',csv.replace('0.10','0.11'),'conflict.csv'));assert.equal(room.snapshot().bills?.[0].amountCents,10);assert.throws(()=>room.importBills('missing-id',csv,'bills.csv'));
    const saved=join(dir,'backup.db');await store.backup(saved);validatedBackup(saved).close();room.close();const restored=await restoreStore(store,join(dir,'db.db'),saved);store=restored.store;assert.equal(store.value<any[]>('bills',[]).length,2);assert.equal(SCHEMA_VERSION,3);
  }finally{room.close();store.close();rmSync(dir,{recursive:true,force:true});}
});
test('update selection separates preview/stable and rejects version/path injection',()=>{
  const releases=[{tag_name:'v0.4.0',draft:false,prerelease:true},{tag_name:'v0.2.0',draft:false,prerelease:false},{tag_name:'v99.0.0',draft:true,prerelease:false},{tag_name:'../bad',draft:false,prerelease:false}];
  assert.equal(selectUpdate('0.3.0',releases,'stable').available,false);const next=selectUpdate('0.3.0',releases,'preview');assert.equal(next.latest,'v0.4.0');assert.ok(next.available);assert.ok(validReleasePage(next.url));assert.equal(validReleasePage('https://evil.example/v0.4.0'),false);assert.equal(validReleasePage('https://github.com/frankxiaofei/agent-teamroom/releases/tag/v0.4.0?redirect=evil'),false);assert.equal(selectUpdate('0.4.0',releases,'preview').available,false);
});
test('update lookup handles offline and malformed responses without download/install',async()=>{
  const calls:string[]=[];const fetcher=(async(url: string)=>{calls.push(url);return new Response('[]');}) as typeof fetch;assert.equal((await checkUpdates('0.3.0','preview',fetcher)).available,false);assert.equal(calls.length,1);assert.ok(calls[0].startsWith('https://api.github.com/repos/frankxiaofei/agent-teamroom/releases'));
  await assert.rejects(checkUpdates('0.3.0','stable',(async()=>new Response('',{status:503})) as typeof fetch),/不可用/);await assert.rejects(checkUpdates('0.3.0','bad' as any,fetcher),/通道/);
});
test('WorkBuddy transport requires read-only whitelist and rejects write permission before spawn',async()=>{
  assert.ok(workBuddyArgs.includes('--strict-mcp-config'));assert.equal(workBuddyArgs[workBuddyArgs.indexOf('--tools')+1],'Read,Grep,Glob');assert.equal(workBuddyArgs[workBuddyArgs.indexOf('--setting-sources')+1],'');
  const task:Task={id:'task',messageId:'message',agentId:'workbuddy',prompt:'hello',workspace:process.cwd(),writable:false,status:'running',source:'live',createdAt:1,lastEventAt:1,result:''};
  const command={file:process.execPath,args:[fileURLToPath(new URL('./fixtures/acp-server.mjs',import.meta.url)),'workbuddy']};let text='';
  await new WorkBuddyRun(command).run(task,{mode:'live',workspace:task.workspace,writable:false},{text:v=>{text=v;},thread:()=>{},activity:()=>{},approval:()=>assert.fail('Readonly approvals must be declined')});assert.equal(text,'readonly');
  await assert.rejects(new WorkBuddyRun({file:'must-not-start',args:[]}).run(task,{mode:'live',workspace:task.workspace,writable:true},{} as any),/目前只读/);
});
test('Cursor Windows launch resolves bundled Node without shell wrappers and ignores invalid version directories',()=>{
  const dir=mkdtempSync(join(tmpdir(),'teamroom-cursor-'));try{for(const name of ['2026.9.2-abcd','2026.10.16-abcd','malicious']){const target=join(dir,'versions',name);mkdirSync(target,{recursive:true});writeFileSync(join(target,'node.exe'),'fixture');writeFileSync(join(target,'index.js'),'fixture');}const command=cursorWindowsCommand(dir,['acp'])!;assert.ok(command.file.includes('2026.10.16-abcd'));assert.equal(command.args.at(-1),'acp');assert.equal(command.file.endsWith('.cmd'),false);}finally{rmSync(dir,{recursive:true,force:true});}
});

test('WorkBuddy write requests fail before persistence but read-only discussions remain available',()=>{
 const store=new Store(':memory:'),room=new Teamroom(store,1,name=>['codebuddy','codex'].includes(name));room.settings({mode:'live',workspace:process.cwd(),writable:true});const before=store.tasks().length;
 assert.equal(room.availability().find(a=>a.agentId==='workbuddy')?.available,false);assert.equal(room.availability('live',false).find(a=>a.agentId==='workbuddy')?.available,true);assert.throws(()=>room.send({id:crypto.randomUUID(),text:'@WorkBuddy edit'}),/目前只读/);assert.equal(store.tasks().length,before);room.close();store.close();
});

test('signed updates never download from an unsigned current app or install a different certificate',async()=>{
 let downloads=0,installs=0;const valid={status:'Valid',thumbprint:'a'.repeat(40)},updater={async checkForUpdates(){return {updateInfo:{version:'0.4.0'}};},async downloadUpdate(){downloads++;return ['download.exe'];},quitAndInstall(){installs++;}};
 const options={executable:'current.exe',expectedVersion:'0.4.0',updater,canQuit:()=>true,signature:async()=>valid};
 assert.equal(trustedSignature({status:'NotSigned'}),false);await assert.rejects(installSignedUpdate({...options,signature:async()=>({status:'NotSigned'})}),/未通过可信/);assert.equal(downloads,0);
 await assert.rejects(installSignedUpdate({...options,signature:async(file)=>file==='current.exe'?valid:{status:'Valid',thumbprint:'b'.repeat(40)}}),/不一致/);assert.equal(installs,0);
 await assert.rejects(installSignedUpdate({...options,canQuit:()=>false}),/执行中的任务/);assert.equal(installs,0);
 await installSignedUpdate(options);assert.equal(installs,1);
 await assert.rejects(installSignedUpdate({...options,expectedVersion:'0.5.0'}),/版本已变化/);assert.equal(installs,1);
});
