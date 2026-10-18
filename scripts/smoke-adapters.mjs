import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeRun } from '../dist-main/core/claude.js';
import { OpenCodeRun } from '../dist-main/core/opencode.js';
if (!process.argv.includes('--inference')) throw new Error('Pass --inference to send one tiny authenticated Claude request.');
const workspace = mkdtempSync(join(tmpdir(), 'teamroom-live-'));
const tool = process.argv.includes('--opencode') ? 'opencode' : 'claude';
const run = tool === 'opencode' ? new OpenCodeRun() : new ClaudeRun(), at = Date.now(); let text = '', usage;
const timer = setTimeout(() => void run.cancel(), 120000);
try {
  await run.run({ id:'smoke',messageId:'smoke',agentId:'claude',prompt:'Reply with exactly TEAMROOM_OK. Do not read files or use tools.',workspace,writable:false,status:'running',source:'live',createdAt:at,lastEventAt:at,result:'' }, { mode:'live',workspace,writable:false }, { text: v => { text=v; },thread:()=>{},activity:()=>{},approval:(_id,_kind,_description,answer)=>answer(false),usage:v=>{usage=v;} });
  console.log(JSON.stringify({tool,live:true,expectedReply:text.trim()==='TEAMROOM_OK',textLength:text.length,usageAvailable:Boolean(usage),permissions:'restricted-readonly'}));
} catch (e) { console.log(JSON.stringify({tool,live:false,error:/auth|login|登录|认证|API key/i.test(e.message)?'authentication-required':/取消|timeout/i.test(e.message)?'timeout':e.message.slice(0,350)})); process.exitCode=1; }
finally { clearTimeout(timer); run.close(); }
