import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Task, Settings } from './types.js';

export interface Command { file: string; args: string[]; }
export function codexCommand(): Command {
  if (process.platform !== 'win32') {
    execFileSync('which', ['codex'], { stdio: 'pipe', timeout: 5000 });
    return { file: 'codex', args: ['app-server'] };
  }
  const paths = execFileSync('where.exe', ['codex'], { encoding: 'utf8', windowsHide: true, timeout: 5000 }).trim().split(/\r?\n/);
  const executable = paths.find(p => p.toLowerCase().endsWith('.exe'));
  if (executable) return { file: executable, args: ['app-server'] };
  for (const path of paths) {
    const entry = join(dirname(path), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (existsSync(entry)) return { file: process.execPath, args: [entry, 'app-server'] };
  }
  throw new Error('未找到可执行的 Codex CLI。请安装官方 CLI，并在外部终端完成登录。');
}

// Only structured JSON goes to stdin. Prompts never become shell commands.
export class RpcClient {
  private process: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  onEvent: (method: string, params: any, id?: number | string) => void = () => {};
  onClose: (error: Error) => void = () => {};
  private closed = false;
  constructor(command: Command) {
    this.process = spawn(command.file, command.args, { windowsHide: true, shell: false, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    const lines = createInterface({ input: this.process.stdout });
    lines.on('line', line => {
      let message: any;
      try { message = JSON.parse(line); } catch { this.stop(new Error('Codex 返回了无法解析的协议消息。')); return; }
      if (message.id !== undefined && !message.method) {
        const waiter = this.pending.get(message.id);
        if (waiter) { clearTimeout(waiter.timer); this.pending.delete(message.id); message.error ? waiter.reject(new Error(message.error.message || 'Codex 请求失败')) : waiter.resolve(message.result); }
      } else if (typeof message.method === 'string') this.onEvent(message.method, message.params || {}, message.id);
    });
    // Drain stderr without persisting it: provider diagnostics can contain local paths or credentials.
    this.process.stderr.on('data', () => {});
    this.process.on('error', () => this.stop(new Error('无法启动 Codex CLI，请检查安装与 PATH。')));
    this.process.on('close', () => this.stop(new Error('Codex 进程已退出；本次任务未确认完成。')));
  }
  request(method: string, params: unknown = {}): Promise<any> {
    if (this.closed) return Promise.reject(new Error('Codex 连接已关闭。'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex ${method} 请求超时。`)); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }
  notify(method: string, params: unknown = {}) { this.write({ method, params }); }
  reply(id: number | string, result: unknown) { this.write({ id, result }); }
  reject(id: number | string) { this.write({ id, error: { code: -32601, message: 'This interactive request is not supported by Teamroom yet.' } }); }
  private write(message: unknown) { if (!this.closed) this.process.stdin.write(JSON.stringify(message) + '\n'); }
  private stop(error: Error) {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
    this.pending.clear(); this.onClose(error); this.process.kill();
  }
  close() { this.stop(new Error('Codex 连接已关闭。')); }
  async initialize() {
    await this.request('initialize', { clientInfo: { name: 'teamroom', title: 'Teamroom', version: '0.1.0' } });
    this.notify('initialized');
  }
}

export interface RunEvents {
  text(text: string): void;
  activity(text: string): void;
  thread(id: string): void;
  approval(id: string, kind: string, description: string, answer: (allow: boolean) => void): void;
}
export class CodexRun {
  private rpc?: RpcClient;
  private threadId?: string;
  private turnId?: string;
  private aborted = false;
  private finish?: (error?: Error) => void;
  constructor(private command: Command = codexCommand()) {}
  async run(task: Task, settings: Settings, events: RunEvents): Promise<void> {
    const rpc = this.rpc = new RpcClient(this.command);
    const texts = new Map<string, string>();
    const done = new Promise<void>((resolve, reject) => { this.finish = error => error ? reject(error) : resolve(); });
    // Attach a rejection handler immediately; a process can fail during initialization.
    void done.catch(() => {});
    rpc.onClose = error => this.finish?.(error);
    rpc.onEvent = (method, p, id) => {
      if (id !== undefined) {
        if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
          const description = [p.command, p.reason, p.cwd, p.grantRoot].filter(Boolean).join('\n') || '请求执行命令或修改文件';
          events.approval(String(id), method, description, allow => rpc.reply(id, { decision: allow ? 'accept' : 'decline' }));
        } else rpc.reject(id);
        return;
      }
      if (method === 'turn/started') this.turnId = p.turn?.id;
      if (method === 'error') events.activity(p.willRetry ? '模型连接暂未成功，工具正在重试' : '模型返回错误，等待终态');
      if (method === 'item/agentMessage/delta') { texts.set(p.itemId, (texts.get(p.itemId) || '') + (p.delta || '')); events.text([...texts.values()].join('\n\n')); }
      if (method === 'item/completed' && p.item?.type === 'agentMessage') { texts.set(p.item.id, p.item.text || ''); events.text([...texts.values()].join('\n\n')); }
      if (method === 'item/started') events.activity(p.item?.type === 'commandExecution' ? '执行命令中' : p.item?.type === 'fileChange' ? '修改文件中' : '正在处理 ' + (p.item?.type || '任务'));
      if (method === 'turn/completed') {
        if (p.turn?.status === 'completed') this.finish?.();
        else this.finish?.(new Error(p.turn?.error?.message || (p.turn?.status === 'interrupted' ? '任务已中断。' : 'Codex 未完成本次任务。')));
      }
    };
    try {
      await rpc.initialize();
      const params = { cwd: task.workspace, sandbox: settings.writable ? 'workspace-write' : 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'user' };
      const result = await rpc.request(task.threadId ? 'thread/resume' : 'thread/start', task.threadId ? { ...params, threadId: task.threadId } : params);
      this.threadId = result.thread.id; events.thread(this.threadId!);
      if (this.aborted) throw new Error('任务已取消。');
      const response = await rpc.request('turn/start', { threadId: this.threadId, input: [{ type: 'text', text: task.prompt }] });
      this.turnId = response.turn.id;
      if (this.aborted) await this.cancel();
      await done;
    } finally { this.finish = undefined; rpc.close(); }
  }
  async cancel() {
    this.aborted = true;
    if (this.rpc && this.threadId && this.turnId) await this.rpc.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId });
    else this.finish?.(new Error('任务已取消。'));
  }
  close() { this.aborted = true; this.rpc?.close(); }
}
export async function readCodexQuota(command = codexCommand()): Promise<unknown> {
  const rpc = new RpcClient(command);
  try { await rpc.initialize(); return await rpc.request('account/rateLimits/read'); } finally { rpc.close(); }
}
