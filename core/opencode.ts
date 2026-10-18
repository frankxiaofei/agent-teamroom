import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { AcpRun } from './acp.js';
import { resolveCommand } from './commands.js';
import type { RunEvents } from './codex.js';
import type { Settings, Task } from './types.js';
const execute = promisify(execFile), readers = new Set(['read','glob','grep','list']);
export function openCodeEnvironment(directory: string, writable: boolean): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(OPENCODE_CONFIG|OPENCODE_PERMISSION|OPENCODE_TEST_MANAGED_CONFIG_DIR)/.test(key)) delete env[key];
  const policy = { '*': writable ? 'ask' : 'deny', read:'allow', glob:'allow', grep:'allow', list:'allow', external_directory: writable ? 'ask' : 'deny' };
  return { ...env, ELECTRON_RUN_AS_NODE:'1', XDG_CONFIG_HOME:join(directory,'config'), OPENCODE_CONFIG_DIR:join(directory,'config','opencode'), OPENCODE_DISABLE_PROJECT_CONFIG:'true', OPENCODE_DISABLE_CLAUDE_CODE:'true', OPENCODE_DISABLE_EXTERNAL_SKILLS:'true', OPENCODE_CONFIG_CONTENT:JSON.stringify({ permission:policy, agent:{plan:{permission:policy},build:{permission:policy}}, plugin:[], mcp:{}, autoupdate:false, snapshot:false }), OPENCODE_PERMISSION:JSON.stringify(policy) };
}
export function verifyOpenCodePolicy(value: unknown, data: string, writable: boolean) {
  const rules = (value as any)?.permission;
  const deny = () => { throw new Error('OpenCode 实际权限与 Teamroom 不符，未发送任务。请检查系统 managed 配置或更新 CLI。'); };
  if (!Array.isArray(rules) || !rules.length || typeof data !== 'string') return deny();
  let boundary = -1;
  rules.forEach((r: any, i: number) => { if (r?.permission === '*' && r.pattern === '*') boundary = i; });
  const wildcard = rules[boundary];
  if (wildcard?.action !== (writable ? 'ask' : 'deny')) return deny();
  const output = join(data,'tool-output');
  for (const r of rules.slice(boundary)) {
    if (!r || typeof r.permission !== 'string' || typeof r.pattern !== 'string' || !['allow','ask','deny'].includes(r.action)) return deny();
    if (r.action === 'deny' || (writable && r.action === 'ask') || readers.has(r.permission)) continue;
    // OpenCode appends one read-only cache exception. No other external path may auto-allow.
    if (r.permission === 'external_directory' && r.action === 'allow' && /[\\/]\*$/.test(r.pattern) && resolve(r.pattern.slice(0,-2)) === resolve(output)) continue;
    return deny();
  }
}
export class OpenCodeRun {
  private runner?: AcpRun;
  private aborted = new AbortController();
  async run(task: Task, settings: Settings, events: RunEvents) {
    const directory = mkdtempSync(join(tmpdir(),'teamroom-opencode-'));
    try {
      const env = openCodeEnvironment(directory, settings.writable); mkdirSync(env.OPENCODE_CONFIG_DIR!,{recursive:true});
      const probe = async (args: string[]) => { const command = resolveCommand('opencode',args); const result = await execute(command.file,command.args,{ cwd:task.workspace,env,windowsHide:true,timeout:20000,maxBuffer:2*1024*1024,signal:this.aborted.signal }); if (args[1] === 'paths') { const data = result.stdout.match(/^data\s+(.+)$/m)?.[1]?.trim(); if (!data || !isAbsolute(data)) throw new Error(); return { data }; } return JSON.parse(result.stdout); };
      let data: any, policy: any;
      try { data = await probe(['debug','paths']); policy = await probe(['debug','agent',settings.writable?'build':'plan','--pure']); }
      catch { throw new Error('无法验证 OpenCode 最终权限，未发送任务。请更新 CLI 并检查系统配置。'); }
      verifyOpenCodePolicy(policy,data.data,settings.writable);
      if (this.aborted.signal.aborted) throw new Error('任务已取消。');
      const command = resolveCommand('opencode',['acp','--pure']);
      this.runner = new AcpRun({...command,env},'OpenCode',undefined,'build'); await this.runner.run(task,settings,events);
    } finally {
      const path = relative(resolve(tmpdir()),resolve(directory));
      if (!isAbsolute(path) && !path.startsWith('..') && path.startsWith('teamroom-opencode-')) rmSync(directory,{recursive:true,force:true});
    }
  }
  async cancel() { this.aborted.abort(); await this.runner?.cancel(); }
  close() { this.aborted.abort(); this.runner?.close(); }
}
