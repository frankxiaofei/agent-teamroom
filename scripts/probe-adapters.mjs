import { AcpClient } from '../dist-main/core/acp.js';
import { resolveCommand } from '../dist-main/core/commands.js';
const definitions = { opencode: ['acp', '--pure'], cline: ['--acp', '--auto-approve', 'false'], grok: ['--no-auto-update', 'agent', 'stdio'] };
for (const [name, args] of Object.entries(definitions)) {
  let client;
  try {
    client = new AcpClient(resolveCommand(name, args), process.cwd());
    const init = await client.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: 'Teamroom probe', version: '0.2.0' } }, 20000);
    if (name === 'grok') await client.request('authenticate', { methodId: 'cached_token', _meta: { headless: true } }, 20000);
    const session = await client.request('session/new', { cwd: process.cwd(), mcpServers: [] }, 20000);
    console.log(JSON.stringify({ tool: name, initialized: true, protocol: init.protocolVersion, modes: session.modes?.availableModes?.map(m => m.id), session: Boolean(session.sessionId), keys: Object.keys(session), config: session.configOptions?.map(c => ({ id: c.id, category: c.category, options: c.options?.map(o => ({ value: o.value, name: o.name })) })) }));
  } catch (error) { console.log(JSON.stringify({ tool: name, initialized: false, error: /auth|login|登录|认证/i.test(error.message) ? 'authentication-required' : /超时|timeout/i.test(error.message) ? 'timeout' : 'probe-failed' })); }
  finally { client?.close(); }
}
