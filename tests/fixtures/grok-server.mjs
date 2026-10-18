import { createInterface } from 'node:readline';
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const unsigned = process.argv.includes('unsigned');
let promptId;
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.id === 9 && !message.method) { send({ id: promptId, result: { stopReason: 'end_turn' } }); return; }
  if (message.id === 7 && !message.method) {
    const allowed = message.result?.outcome?.outcome === 'selected';
    send({ method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: allowed ? 'fixture-grok-approved' : 'fixture-grok-declined' } } } });
    send({ id: promptId, result: { stopReason: 'end_turn' } });
    return;
  }
  if (message.method === 'initialize') send({ id: message.id, result: { protocolVersion:1, agentCapabilities:{loadSession:true}, authMethods: unsigned ? [] : [{ id: 'cached_token' }] } });
  if (message.method === 'authenticate') send({ id: message.id, result: {} });
  if (message.method === 'session/load') send({ id: message.id, error: { message: 'missing session' } });
  if (message.method === 'session/new') send({ id: message.id, result: { sessionId: 'grok-session', modes:{availableModes:[{id:'plan',name:'Plan'}]} } });
  if (message.method === 'session/set_mode') send({id:message.id,result:{}});
  if (message.method === 'session/prompt') {
    promptId = message.id;
    const text = message.params.prompt[0].text;
    if (text.includes('permission')) { send({ id: 7, method: 'session/request_permission', params: { toolCall: { title: 'echo fixture' }, options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }, { optionId: 'reject', name: 'Reject', kind: 'reject_once' }] } }); return; }
    if (text.includes('unsupported')) { send({ id: 9, method: 'session/ask', params: {} }); return; }
    if (text.includes('wait')) return;
    send({ method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: 'fixture-grok' } } } });
    send({ id: message.id, result: { stopReason: 'end_turn' } });
  }
});
