import { createInterface } from 'node:readline';
const mode = process.argv[2], send = m => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
let readonly = false, selectedMode = 'unsafe', promptId;
createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line), reply = result => send({ id: m.id, result });
  if (m.id === 'permission' && !m.method) {
    const outcome = m.result.outcome;
    send({ method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: JSON.stringify(outcome) } } } });
    send({ id: promptId, result: { stopReason: 'end_turn' } }); return;
  }
  if (m.method === 'initialize') { if (mode === 'null') { process.stdout.write('null\n'); return; } if (m.params.clientCapabilities.fs.writeTextFile || m.params.clientCapabilities.terminal) process.exit(2); reply({ protocolVersion: mode === 'version' ? 2 : 1, agentInfo: { name: mode === 'imposter' ? 'Other' : 'Cursor' }, agentCapabilities: { loadSession: true } }); }
  if (m.method === 'session/load') {
    if (mode.startsWith('replay')) {
      send({ method: 'session/update', params: { sessionId: m.params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { text: '<teamroom-discussion>OLD_QUESTION</teamroom-discussion>' } } } });
      reply({ sessionId: m.params.sessionId, modes: { availableModes: [{ id: 'plan' }] } });
    } else send({ id: m.id, error: { message: 'Resume failed' } });
  }
  if (m.method === 'session/new') reply({ sessionId: 'fixture', ...(mode === 'none' ? {} : mode === 'config' ? { configOptions: [{ id: 'scene', category: 'mode', options: [{ value: 'build' }, { value: 'plan' }] }] } : { modes: { availableModes: [{ id: 'plan' }] } }) });
  if (m.method === 'session/set_config_option' || m.method === 'session/set_mode') { selectedMode = m.params.value || m.params.modeId; readonly = selectedMode === 'plan'; reply({}); }
  if (m.method === 'session/prompt') {
    promptId = m.id;
    if (mode === 'none') process.exit(3);
    if (m.params.prompt[0].text === 'permission') { send({ id: 'permission', method: 'session/request_permission', params: { toolCall: { title: 'write fixture' }, options: [{ kind: 'allow_always', optionId: 'always' }, { kind: 'allow_once', optionId: 'once' }] } }); return; }
    if (m.params.prompt[0].text === 'wait') return;
    if (mode === 'replay-empty') { reply({ stopReason: 'end_turn' }); return; }
    send({ method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: readonly ? 'readonly' : mode === 'config' && selectedMode !== 'build' ? 'unsafe' : 'writable' } } } });
    reply({ stopReason: mode === 'limit' ? 'max_tokens' : 'end_turn' });
  }
});
