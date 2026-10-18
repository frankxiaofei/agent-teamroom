import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Command } from './codex.js';
const entries: Record<string, string[]> = {
  claude: ['@anthropic-ai/claude-code/bin/claude.exe', '@anthropic-ai/claude-code/cli.js'],
  opencode: ['opencode-ai/bin/opencode.exe', 'opencode-ai/bin/opencode'], cline: ['cline/bin/cline'],
  grok: ['@xai-official/grok/bin/grok', '@xai/grok/bin/grok.js'], 'cursor-agent': [], agent: [], workbuddy: [],
};
// Only known executable entrypoints; never execute shell wrappers or interpolate prompts.
export function resolveCommand(name: string, args: string[] = []): Command {
  if (!(name in entries)) throw new Error('未知工具命令。');
  if (process.platform !== 'win32') {
    const file = execFileSync('which', [name], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0];
    return { file, args };
  }
  let paths: string[];
  try { paths = execFileSync('where.exe', [name], { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/); }
  catch { throw new Error(`未找到 ${name} CLI，请在外部终端安装并登录。`); }
  const executable = paths.find(file => file.toLowerCase().endsWith('.exe'));
  if (executable) return { file: executable, args };
  for (const wrapper of paths) for (const entry of entries[name]) {
    const file = join(dirname(wrapper), 'node_modules', entry);
    if (existsSync(file)) return file.endsWith('.exe') ? { file, args } : { file: process.execPath, args: [file, ...args] };
  }
  throw new Error(`${name} CLI 的启动入口不受支持，请检查官方安装。`);
}
