import { execFileSync } from 'node:child_process';
import { AGENTS } from './agents.js';
import { cursorWindowsCommand } from './commands.js';
import { join } from 'node:path';
import type { AgentId } from './types.js';

export interface ToolInstall { agentId: AgentId; installed: boolean; executable: boolean; detail: string; }
export type CommandProbe = (name: string) => boolean;
const runners = new Set<AgentId>(['codex', 'grok', 'claude', 'opencode', 'cursor', 'cline', 'workbuddy']);
const commands: Record<AgentId, { agent: string[]; editor?: string[] }> = {
  claude: { agent: ['claude'] },
  codex: { agent: ['codex'] },
  opencode: { agent: ['opencode'] },
  cursor: { agent: ['cursor-agent', 'agent'], editor: ['cursor'] },
  cline: { agent: ['cline'] },
  workbuddy: { agent: ['codebuddy'] },
  grok: { agent: ['grok'] },
};

export function commandExists(name: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { stdio: 'pipe', timeout: 5000, windowsHide: true });
    return true;
  } catch { return Boolean(process.platform==='win32'&&['agent','cursor-agent'].includes(name)&&process.env.LOCALAPPDATA&&cursorWindowsCommand(join(process.env.LOCALAPPDATA,'cursor-agent'),[])); }
}
export function detectInstalls(probe: CommandProbe = commandExists): ToolInstall[] {
  return AGENTS.map(agent => {
    const spec = commands[agent.id];
    const hit = spec.agent.find(name => probe(name));
    if (hit) {
      const executable = runners.has(agent.id);
      return { agentId: agent.id, installed: true, executable, detail: executable ? `已检测到 ${hit}` : `已检测到 ${hit}，执行适配尚未接入` };
    }
    const editor = spec.editor?.find(name => probe(name));
    if (editor) return { agentId: agent.id, installed: false, executable: false, detail: `已检测到 ${editor}，尚未发现可执行的 Agent 命令` };
    return { agentId: agent.id, installed: false, executable: false, detail: `未检测到 ${spec.agent[0]}` };
  });
}
