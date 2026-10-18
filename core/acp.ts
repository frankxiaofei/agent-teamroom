import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Command, RunEvents } from './codex.js';
import type { Settings, Task } from './types.js';
export class AcpClient {
  private child: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer?: NodeJS.Timeout }>();
  private closed = false;
  onEvent: (method: string, params: any, id?: number | string) => void = () => {};
  constructor(command: Command, cwd?: string) {
    this.child = spawn(command.file, command.args, { cwd, shell: false, windowsHide: true, env: { ...(command.env || process.env), ELECTRON_RUN_AS_NODE: '1' } });
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      let m: any;
      try { m = JSON.parse(line); if (!m || typeof m !== 'object' || Array.isArray(m) || line.length > 2 * 1024 * 1024) throw new Error(); } catch { this.close(new Error('工具返回无效 ACP 消息。')); return; }
      if (m.id !== undefined && !m.method) {
        const p = this.pending.get(m.id); if (!p) return;
        if (p.timer) clearTimeout(p.timer); this.pending.delete(m.id);
        m.error ? p.reject(new Error(String(m.error.message || 'ACP 请求失败'))) : p.resolve(m.result ?? {});
      } else if (typeof m.method === 'string') {
        try { if (m.params !== undefined && (!m.params || typeof m.params !== 'object' || Array.isArray(m.params))) throw new Error(); this.onEvent(m.method, m.params || {}, m.id); }
        catch { this.close(new Error('工具返回无效 ACP 事件。')); }
      }
    });
    this.child.stderr.on('data', () => {});
    this.child.on('error', () => this.close(new Error('工具进程无法启动，请检查 CLI。')));
    this.child.on('close', () => { lines.close(); this.close(new Error('工具进程已退出，未确认完成。')); });
  }
  request(method: string, params: unknown = {}, timeout = 30000): Promise<any> {
    if (this.closed) return Promise.reject(new Error('ACP 连接已关闭。'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = timeout ? setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} 请求超时。`)); }, timeout) : undefined;
      this.pending.set(id, { resolve, reject, timer }); this.write({ jsonrpc: '2.0', id, method, params });
    });
  }
  notify(method: string, params: unknown) { this.write({ jsonrpc: '2.0', method, params }); }
  reply(id: number | string, result: unknown) { this.write({ jsonrpc: '2.0', id, result }); }
  reject(id: number | string) { this.write({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Unsupported client operation' } }); }
  private write(message: unknown) { if (!this.closed && this.child.stdin.writable) this.child.stdin.write(JSON.stringify(message) + '\n', error => { if (error) this.close(new Error('ACP 输入已关闭。')); }); }
  close(error = new Error('ACP 连接已取消。')) {
    if (this.closed) return; this.closed = true;
    for (const p of this.pending.values()) { if (p.timer) clearTimeout(p.timer); p.reject(error); } this.pending.clear();
    const pid = this.child.pid; this.child.stdin.destroy(); this.child.stdout.destroy(); this.child.stderr.destroy(); this.child.kill();
    if (process.platform === 'win32' && pid) spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).unref();
  }
}
export class AcpRun {
  private rpc?: AcpClient;
  private sessionId?: string;
  private cancelled = false;
  constructor(private command: Command, private label: string, private authenticate?: (rpc: AcpClient, init: any) => Promise<void>, private writableMode?: string) {}
  async run(task: Task, settings: Settings, events: RunEvents) {
    const rpc = this.rpc = new AcpClient(this.command, task.workspace); let text = '', prompting = false;
    rpc.onEvent = (method, p, id) => {
      if (method === 'session/update') {
        if (!prompting || (p.sessionId !== undefined && p.sessionId !== this.sessionId)) return;
        const u = p.update || {};
        if (u.sessionUpdate === 'agent_message_chunk' && typeof u.content?.text === 'string') { text += u.content.text; events.text(text); }
        else if (u.sessionUpdate) events.activity(`${this.label} · ${u.sessionUpdate}`);
      } else if (id !== undefined) {
        if (method !== 'session/request_permission') { rpc.reject(id); return; }
        const once = Array.isArray(p.options) ? p.options.find((o: any) => o.kind === 'allow_once' && typeof o.optionId === 'string') : undefined;
        const deny = () => rpc.reply(id, { outcome: { outcome: 'cancelled' } });
        if (!settings.writable || !once) { deny(); return; }
        let answered = false;
        events.approval(String(id), method, String(p.toolCall?.title || '请求执行操作'), allow => { if (answered) return; answered = true; allow ? rpc.reply(id, { outcome: { outcome: 'selected', optionId: once.optionId } }) : deny(); });
      }
    };
    try {
      const init = await rpc.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: 'Teamroom', version: '0.2.0' } });
      if (init.protocolVersion !== undefined && init.protocolVersion !== 1) throw new Error('工具 ACP 协议版本不兼容。');
      if (this.label === 'Cursor' && !/cursor/i.test(init.agentInfo?.name || '')) throw new Error('未识别为官方 Cursor Agent，未发送认证或任务。');
      if (this.authenticate) await this.authenticate(rpc, init);
      let session: any;
      if (task.threadId && init.agentCapabilities?.loadSession) session = await rpc.request('session/load', { sessionId: task.threadId, cwd: task.workspace, mcpServers: [] });
      else session = await rpc.request('session/new', { cwd: task.workspace, mcpServers: [] });
      this.sessionId = session.sessionId || task.threadId;
      if (!this.sessionId) throw new Error('工具未返回会话 ID。');
      if (!settings.writable || this.writableMode) {
        const candidates = settings.writable ? [this.writableMode] : ['plan', 'ask', 'read-only', 'readonly'];
        const modes = session.modes?.availableModes || [];
        const safe = modes.find((m: any) => candidates.includes(m.id));
        if (safe) await rpc.request('session/set_mode', { sessionId: this.sessionId, modeId: safe.id });
        else {
          const config = (session.configOptions || []).find((c: any) => c.category === 'mode');
          const options = (config?.options || []).flatMap((o: any) => o.options || [o]);
          const value = options.find((o: any) => candidates.includes(o.value));
          if (!value) throw new Error(`${this.label} 未声明只读模式，未发送任务。请更新 CLI 或使用有只读模式的工具。`);
          await rpc.request('session/set_config_option', { sessionId: this.sessionId, configId: config.id, value: value.value });
        }
      }
      events.thread(this.sessionId);
      if (this.cancelled) throw new Error('任务已取消。');
      prompting = true;
      const result = await rpc.request('session/prompt', { sessionId: this.sessionId, prompt: [{ type: 'text', text: task.prompt }] }, 600000);
      if (this.cancelled || result.stopReason === 'cancelled') throw new Error('任务已取消。');
      if (result.stopReason !== 'end_turn') throw new Error(`${this.label} 未确认成功结束：${result.stopReason || '未知'}`);
      if (!text.trim()) throw new Error(`${this.label} 未返回可验证的文本结果。`);
    } finally { rpc.close(); }
  }
  async cancel() { this.cancelled = true; if (this.sessionId) this.rpc?.notify('session/cancel', { sessionId: this.sessionId }); this.rpc?.close(); }
  close() { this.cancelled = true; this.rpc?.close(); }
}
