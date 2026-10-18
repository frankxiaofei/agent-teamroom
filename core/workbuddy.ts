import { AcpRun } from './acp.js';
import { resolveCommand } from './commands.js';
import type { Command, RunEvents } from './codex.js';
import type { Settings, Task } from './types.js';
export const workBuddyArgs = ['--acp', '--agent', 'cli', '--permission-mode', 'plan', '--tools', 'Read,Grep,Glob', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'];
// This is the documented CodeBuddy CLI channel, not a bridge into existing desktop chats.
export class WorkBuddyRun {
  private runner?: AcpRun;
  private cancelled = false;
  constructor(private command?: Command) {}
  async run(task: Task, settings: Settings, events: RunEvents) {
    if (settings.writable) throw new Error('WorkBuddy 官方 CLI 通道目前只读；请关闭写入权限，或选择其他已验证写入适配器。');
    if (this.cancelled) throw new Error('任务已取消。');
    this.runner = new AcpRun(this.command || resolveCommand('codebuddy', workBuddyArgs), 'WorkBuddy（CodeBuddy CLI）', async (_rpc, init) => {
      if (init.agentInfo?.name && !/codebuddy/i.test(init.agentInfo.name)) throw new Error('未识别为官方 CodeBuddy CLI，未发送 WorkBuddy 任务。');
    });
    await this.runner.run(task,settings,events);
  }
  async cancel() { this.cancelled = true; await this.runner?.cancel(); }
  close() { this.cancelled = true; this.runner?.close(); }
}
