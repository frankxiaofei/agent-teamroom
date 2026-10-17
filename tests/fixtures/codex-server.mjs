import { createInterface } from 'node:readline';
const send = value => process.stdout.write(JSON.stringify(value)+'\n');
let threadId='fixture-thread',turnId='fixture-turn';
createInterface({input:process.stdin}).on('line',line=>{
  const m=JSON.parse(line);
  if(m.id===100 && !m.method){
    send({method:'item/completed',params:{item:{id:'reply',type:'agentMessage',text:m.error?'fixture-unsupported':m.result?.decision==='accept'?'fixture-approved':'fixture-declined'}}});
    send({method:'turn/completed',params:{turn:{id:turnId,status:'completed'}}});return;
  }
  if(m.method==='initialize')send({id:m.id,result:{}});
  if(m.method==='thread/start'||m.method==='thread/resume'){threadId=m.params.threadId||threadId;send({id:m.id,result:{thread:{id:threadId}}});}
  if(m.method==='account/rateLimits/read')send({id:m.id,result:{rateLimits:{primary:{usedPercent:35,windowDurationMins:300,resetsAt:1800000000}}}});
  if(m.method==='turn/start'){
    send({id:m.id,result:{turn:{id:turnId}}});send({method:'turn/started',params:{turn:{id:turnId}}});
    if(m.params.input[0].text==='wait')return;
    send({method:'item/agentMessage/delta',params:{itemId:'reply',delta:'fixture-'}});
    const kind=m.params.input[0].text==='file'?'item/fileChange/requestApproval':m.params.input[0].text==='unsupported'?'item/tool/requestUserInput':'item/commandExecution/requestApproval';
    send({id:100,method:kind,params:{threadId,turnId,command:'echo fixture',grantRoot:process.cwd(),cwd:process.cwd()}});
  }
  if(m.method==='turn/interrupt'){send({id:m.id,result:{}});send({method:'turn/completed',params:{turn:{id:turnId,status:'interrupted'}}});}
});
