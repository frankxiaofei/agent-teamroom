import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CodexRun, readCodexQuota } from '../core/codex.js';
import type { Task } from '../core/types.js';
const command={file:process.execPath,args:[fileURLToPath(new URL('./fixtures/codex-server.mjs',import.meta.url))]};
const task:Task={id:'test',messageId:'message',agentId:'codex',prompt:'hello',workspace:process.cwd(),writable:false,status:'running',source:'live',createdAt:1,lastEventAt:1,result:''};
test('real process transport handles streaming, approval and authoritative final output',async()=>{
  let text='',approved=false,thread='';const run=new CodexRun(command);
  await run.run(task,{mode:'live',workspace:process.cwd(),writable:false},{text:value=>text=value,activity:()=>{},thread:id=>thread=id,approval:(_id,_kind,description,answer)=>{assert.match(description,/echo fixture/);approved=true;answer(true);}});
  assert.equal(text,'fixture-approved');assert.equal(thread,'fixture-thread');assert.ok(approved);
});
test('existing session is resumed and decline is forwarded once',async()=>{
  let text='',thread='';await new CodexRun(command).run({...task,threadId:'existing'},{mode:'live',workspace:process.cwd(),writable:false},{text:value=>text=value,activity:()=>{},thread:id=>thread=id,approval:(_id,_kind,_description,answer)=>answer(false)});
  assert.equal(thread,'existing');assert.equal(text,'fixture-declined');
});
test('cancellation interrupts a running turn',async()=>{
  const run=new CodexRun(command);const promise=run.run({...task,prompt:'wait'},{mode:'live',workspace:process.cwd(),writable:false},{text:()=>{},activity:()=>{},thread:()=>{},approval:()=>{}});
  await new Promise(r=>setTimeout(r,100));await run.cancel();await assert.rejects(promise,/中断|取消/);
});
test('quota uses account endpoint without starting inference',async()=>{const quota=await readCodexQuota(command) as any;assert.equal(quota.rateLimits.primary.usedPercent,35);});
test('file approval is forwarded while unsupported interactions are never auto-approved',async()=>{
  let text='',kind='';
  await new CodexRun(command).run({...task,prompt:'file'},{mode:'live',workspace:process.cwd(),writable:false},{text:value=>text=value,activity:()=>{},thread:()=>{},approval:(_id,value,_description,answer)=>{kind=value;answer(false);}});
  assert.equal(kind,'item/fileChange/requestApproval');assert.equal(text,'fixture-declined');
  await new CodexRun(command).run({...task,prompt:'unsupported'},{mode:'live',workspace:process.cwd(),writable:false},{text:value=>text=value,activity:()=>{},thread:()=>{},approval:()=>assert.fail('Unsupported request must not become an approval')});
  assert.equal(text,'fixture-unsupported');
});
