import { CodexRun, readCodexQuota } from '../dist-main/core/codex.js';
import { randomUUID } from 'node:crypto';
const workspace=process.cwd();
const quota=await readCodexQuota();
console.log('Codex account endpoint verified:',Object.keys(quota).join(', '));
if(process.argv.includes('--inference')) {
  let output='';
  const task={id:randomUUID(),messageId:randomUUID(),agentId:'codex',prompt:'只回复 TEAMROOM_SMOKE_OK，不要调用任何工具，不要读取或修改文件。',workspace,writable:false,status:'running',createdAt:Date.now(),lastEventAt:Date.now(),result:'',source:'live'};
  const run=new CodexRun();
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;run.close();},180000);
  try {
    await run.run(task,{mode:'live',workspace,writable:false},{text:value=>output=value,activity:kind=>console.log('Codex activity:',kind),thread:()=>console.log('Codex thread initialized'),approval:(_id,_kind,_description,answer)=>answer(false)});
    if(!output.includes('TEAMROOM_SMOKE_OK'))throw new Error('Unexpected smoke response');
    console.log('Real Codex inference verified: TEAMROOM_SMOKE_OK');
  } catch(error) { console.error('Real Codex inference not verified:',timedOut?'180-second smoke deadline exceeded':error.message);process.exitCode=1; }
  finally {clearTimeout(timer);}
}
