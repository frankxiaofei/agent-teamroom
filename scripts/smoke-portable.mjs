import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('.smoke-data',{recursive:true}); mkdirSync('.build-temp',{recursive:true});
const data=mkdtempSync(resolve('.smoke-data/portable-')),env={...process.env,TEAMROOM_DATA_DIR:data,TEMP:resolve('.build-temp'),TMP:resolve('.build-temp')};delete env.ELECTRON_RUN_AS_NODE;
// NSIS does not forward debugger stdout; inspect the real child app through local CDP.
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const args=[`--remote-debugging-port=${port}`];if(process.env.TEAMROOM_SMOKE_NO_SANDBOX==='1')args.push('--no-sandbox','--disable-gpu');
const child=spawn(resolve('release/Teamroom-Portable-0.2.0-x64.exe'),args,{env,windowsHide:true,shell:false,stdio:'ignore'});let browser;
try {
  const deadline=Date.now()+90000;
  while(Date.now()<deadline){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:1500});break;}catch{await new Promise(r=>setTimeout(r,1000));}}
  assert.ok(browser,'Portable child app did not expose its local test CDP endpoint within 90 seconds');
  const page=browser.contexts()[0].pages()[0];await page.getByRole('heading',{name:'Agent 工作群',exact:true}).waitFor();
  await page.evaluate(()=>window.teamroom.send({id:crypto.randomUUID(),text:'@Codex 验证便携版自解压运行',category:'审查'}));
  await page.waitForFunction(async()=>(await window.teamroom.snapshot()).tasks.some(t=>t.prompt==='验证便携版自解压运行'&&t.status==='awaiting_review'));
  console.log(JSON.stringify({portable:true,selfExtraction:true,rendererBridge:true,dispatch:true}));
}finally{await browser?.close();if(child.exitCode===null&&child.pid){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}}
