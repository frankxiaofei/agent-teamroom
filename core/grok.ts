import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import type { Task, Settings } from './types.js';
import type { Command, RunEvents } from './codex.js';

export function grokCommand(): Command {
  const args = ['--no-auto-update', 'agent', 'stdio'];
  if (process.platform !== 'win32') {
    execFileSync('which', ['grok'], { stdio: 'pipe', timeout: 5000 });
    return { file: 'grok', args };
  }
  const paths = execFileSync('where.exe', ['grok'], { encoding: 'utf8', windowsHide: true, timeout: 5000 }).trim().split(/\r?\n/);
  const executable = paths.find(path => path.toLowerCase().endsWith('.exe'));
  if (executable) return { file: executable, args };
  for (const path of paths) {
    const entry = join(dirname(path), 'node_modules', '@xai', 'grok', 'bin', 'grok.js');
    if (existsSync(entry)) return { file: process.execPath, args: [entry, ...args] };
  }
  throw new Error('未找到可执行的 Grok CLI。请安装官方 CLI，并在外部终端完成登录。');
}

class GrokClient {
  private process: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer?: NodeJS.Timeout }>();
  onEvent: (method: string, params: any, id?: number | string) => void = () => {};
  onClose: (error: Error) => void = () => {};
  private closed = false;
  private lines: Interface;
  constructor(command: Command) {
    this.process = spawn(command.file, command.args, { windowsHide: true, shell: false, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    this.lines = createInterface({ input: this.process.stdout });
    this.lines.on('line', line => {
      let message: any;
      try { message = JSON.parse(line); } catch { this.stop(new Error('Grok 返回了无法解析的协议消息。')); return; }
      if (message.id !== undefined && !message.method) {
        const waiter = this.pending.get(message.id);
        if (waiter) { if (waiter.timer) clearTimeout(waiter.timer); this.pending.delete(message.id); message.error ? waiter.reject(new Error(message.error.message || 'Grok 请求失败')) : waiter.resolve(message.result ?? {}); }
      } else if (typeof message.method === 'string') this.onEvent(message.method, message.params || {}, message.id);
    });
    this.process.stderr.on('data', () => {});
    this.process.on('error', () => this.stop(new Error('无法启动 Grok CLI，请检查安装与 PATH。')));
    this.process.on('close', () => this.stop(new Error('Grok 进程已退出；本次任务未确认完成。')));
  }
  request(method: string, params: unknown = {}, timeoutMs = 30000): Promise<any> {
    if (this.closed) return Promise.reject(new Error('Grok 连接已关闭。'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = timeoutMs > 0 ? setTimeout(() => { this.pending.delete(id); reject(new Error(`Grok ${method} 请求超时。`)); }, timeoutMs) : undefined;
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }
  reply(id: number | string, result: unknown) { this.write({ jsonrpc: '2.0', id, result }); }
  reject(id: number | string) { this.write({ jsonrpc: '2.0', id, error: { code: -32601, message: 'This interactive request is not supported by Teamroom yet.' } }); }
  private write(message: unknown) { if (!this.closed) this.process.stdin.write(JSON.stringify(message) + '\n'); }
  private stop(error: Error) {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.pending.values()) { if (waiter.timer) clearTimeout(waiter.timer); waiter.reject(error); }
    this.pending.clear(); this.onClose(error); this.release();
  }
  private release() {
    this.lines.close();
    this.process.stdin.destroy();
    this.process.stdout.destroy();
    this.process.stderr.destroy();
    const pid = this.process.pid;
    this.process.kill();
    if (process.platform === 'win32' && pid) spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).unref();
  }
  close() { this.stop(new Error('Grok 连接已关闭。')); }
}

export class GrokRun {
  private rpc?: GrokClient;
  private aborted = false;
  private finish?: (error?: Error) => void;
  constructor(private command: Command = grokCommand()) {}
  async run(task: Task, _settings: Settings, events: RunEvents): Promise<void> {
    const rpc = this.rpc = new GrokClient(this.command);
    let text = '';
    const done = new Promise<void>((resolve, reject) => { this.finish = error => error ? reject(error) : resolve(); });
    void done.catch(() => {});
    rpc.onClose = error => this.finish?.(error);
    rpc.onEvent = (method, params, id) => {
      if (method === 'session/update') {
        const update = params.update || {};
        if (update.sessionUpdate === 'agent_message_chunk' && update.content?.text) { text += update.content.text; events.text(text); }
        else if (update.sessionUpdate) events.activity('正在处理 ' + update.sessionUpdate);
        return;
      }
      if (id === undefined) return;
      if (method === 'session/request_permission') {
        const options = Array.isArray(params.options) ? params.options : [];
        const allow = options.find((option: any) => /allow|approve|accept/i.test(`${option.kind || ''} ${option.name || ''} ${option.optionId || ''}`));
        const description = params.toolCall?.title || params.toolCall?.rawInput?.command || '请求执行命令或修改文件';
        events.approval(String(id), method, description, accepted => rpc.reply(id, accepted && allow ? { outcome: { outcome: 'selected', optionId: allow.optionId } } : { outcome: { outcome: 'cancelled' } }));
        return;
      }
      rpc.reject(id);
    };
    try {
      const init = await rpc.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true } });
      const methods = new Set((init.authMethods || []).map((method: any) => method.id));
      const methodId = process.env.XAI_API_KEY && methods.has('xai.api_key') ? 'xai.api_key' : methods.has('cached_token') ? 'cached_token' : '';
      if (!methodId) throw new Error('Grok 未登录。请在外部终端执行 grok login，或由 CLI 自己的环境提供认证。');
      await rpc.request('authenticate', { methodId, _meta: { headless: true } });
      let sessionId = task.threadId;
      if (sessionId) { try { await rpc.request('session/load', { sessionId, cwd: task.workspace, mcpServers: [] }); } catch { sessionId = undefined; } }
      if (!sessionId) sessionId = (await rpc.request('session/new', { cwd: task.workspace, mcpServers: [] })).sessionId;
      if (!sessionId) throw new Error('Grok 没有返回会话。');
      events.thread(sessionId);
      if (this.aborted) throw new Error('任务已取消。');
      const result = await rpc.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: task.prompt }] }, 0);
      if (!text) events.text(result.stopReason ? `Grok 已结束（${result.stopReason}），没有文本输出。` : 'Grok 已结束，没有文本输出。');
      this.finish?.();
      await done;
    } catch (error) {
      if (this.aborted) throw new Error('任务已取消。');
      throw error;
    } finally { this.finish = undefined; rpc.close(); }
  }
  async cancel() { this.aborted = true; this.finish?.(new Error('任务已取消。')); this.rpc?.close(); }
  close() { this.aborted = true; this.rpc?.close(); }
}
