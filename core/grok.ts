import { resolveCommand } from './commands.js';
import { AcpRun } from './acp.js';
import type { Command } from './codex.js';
export const grokCommand = () => resolveCommand('grok', ['--no-auto-update', 'agent', 'stdio']);
export class GrokRun extends AcpRun {
  constructor(command: Command = grokCommand()) {
    super(command, 'Grok', async (rpc, init) => {
      const methods = new Set((init.authMethods || []).map((m: any) => m.id));
      const methodId = process.env.XAI_API_KEY && methods.has('xai.api_key') ? 'xai.api_key' : methods.has('cached_token') ? 'cached_token' : '';
      if (!methodId) throw new Error('Grok 未登录，请在外部终端执行 grok login。');
      await rpc.request('authenticate', { methodId, _meta: { headless: true } });
    });
  }
}