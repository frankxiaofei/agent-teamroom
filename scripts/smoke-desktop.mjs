import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const data=mkdtempSync(join(tmpdir(),'teamroom-electron-'));
let application;
const env={...process.env,TEAMROOM_DATA_DIR:data};
delete env.ELECTRON_RUN_AS_NODE;
try {
  application=await electron.launch({args:['.'],env});
  const page=await application.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('heading',{name:'Agent 工作群',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  assert.equal(await page.evaluate(()=>typeof window.process),'undefined');
  await page.getByRole('textbox',{name:'群消息',exact:true}).fill('@Codex @Claude Code 验证群聊派发与成果汇报');
  await page.getByRole('button',{name:'发送到群里',exact:true}).click();
  await page.waitForFunction(async()=>{const snapshot=await window.teamroom.snapshot();return snapshot.tasks.filter(t=>t.prompt==='验证群聊派发与成果汇报').length===2&&snapshot.tasks.filter(t=>t.prompt==='验证群聊派发与成果汇报').every(t=>t.status==='awaiting_review');});
  const before=await page.evaluate(()=>window.teamroom.snapshot());
  assert.equal(before.tasks.filter(t=>t.prompt==='验证群聊派发与成果汇报').length,2);
  await page.waitForFunction(()=>[...document.querySelectorAll('.g-bubble')].filter(el=>el.textContent.includes('【演示交付】收到这项工作：验证群聊派发与成果汇报')).length===2);
  await page.getByRole('textbox',{name:'群消息',exact:true}).fill('没有指定接收人');await page.getByRole('button',{name:'发送到群里',exact:true}).click();
  await page.getByRole('alert').waitFor();assert.equal((await page.evaluate(()=>window.teamroom.snapshot())).tasks.length,before.tasks.length);
  await page.getByRole('textbox',{name:'群消息',exact:true}).fill('');
  await page.getByRole('button',{name:'Agent 工作群',exact:true}).click();
  mkdirSync('docs/images',{recursive:true});await page.screenshot({path:'docs/images/teamroom-desktop.png'});
  assert.deepEqual(errors,[]);await application.close();application=undefined;
  application=await electron.launch({args:['.'],env});
  const reopened=await application.firstWindow();await reopened.getByRole('heading',{name:'Agent 工作群',exact:true}).waitFor();
  assert.equal((await reopened.evaluate(()=>window.teamroom.snapshot())).tasks.filter(t=>t.prompt==='验证群聊派发与成果汇报').length,2);
  if(process.argv.includes('--live-account')) {
    const account=await reopened.evaluate(async workspace=>{await window.teamroom.settings({mode:'live',workspace,writable:false});await window.teamroom.quota();const state=await window.teamroom.snapshot();return {mode:state.settings.mode,available:state.availability.find(a=>a.agentId==='codex')?.available,quotaKeys:Object.keys(state.quota.data)};},process.cwd());
    assert.equal(account.mode,'live');assert.equal(account.available,true);assert.ok(account.quotaKeys.includes('rateLimits'));
    console.log('Desktop live Codex CLI and quota bridge verified.');
  }
  console.log('Desktop smoke passed: isolated preload, multi-mention dispatch, recipient guard, SQLite restart persistence.');
} finally {await application?.close();}
