import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { AGENTS } from './agents.js';
import { executionPrompt, parseMentions } from './mentions.js';
import { CodexRun, readCodexQuota } from './codex.js';
import { GrokRun } from './grok.js';
import { detectInstalls, type CommandProbe, type ToolInstall } from './installs.js';
import { Store } from './store.js';
import type { AgentId, Approval, Availability, Message, Quota, SendInput, Settings, Snapshot, Task } from './types.js';

export class Teamroom extends EventEmitter {
  private approvals = new Map<string, Approval & { answer: (allow: boolean) => void }>();
  private active?: Task;
  private runner?: { cancel(): Promise<void>; close(): void };
  private abort?: AbortController;
  private closing = false;
  private quotaData?: Quota;
  private installs?: ToolInstall[];
  constructor(readonly store: Store, private demoDelay = 650, private probe?: CommandProbe) {
    super();
    if (!store.messages().length) this.seed();
  }
  private seed() {
    const at = Date.now();
    this.store.message({ id: randomUUID(), role: 'system', agentId: null, text: '欢迎来到 Teamroom。输入 @ 选择员工，在群里交代工作。当前为演示模式，可在设置中切换到真实 Codex。', at, source: 'demo' });
    const task: Task = { id: randomUUID(), messageId: randomUUID(), agentId: 'cursor', prompt: '设置页面交互稿', workspace: '', writable: false, status: 'awaiting_review', source: 'demo', createdAt: at - 48000, startedAt: at - 47000, finishedAt: at, lastEventAt: at, result: '演示交付：设置页面交互稿和改动说明已准备好，请老板验收。' };
    this.store.task(task);
    this.store.message({ id: randomUUID(), role: 'agent', agentId: 'cursor', taskId: task.id, text: task.result, at: at + 1, source: 'demo' });
  }
  availability(): Availability[] {
    const settings = this.store.settings();
    const installs = settings.mode === 'live' ? this.installReports() : [];
    return AGENTS.map(agent => {
      if (settings.mode === 'demo') return agent.id === 'workbuddy' ? { agentId: agent.id, available: false, reason: '后续接入，当前无法接收任务' } : { agentId: agent.id, available: true, reason: '演示适配器' };
      const report = installs.find(item => item.agentId === agent.id)!;
      return { agentId: agent.id, available: report.executable, reason: report.executable ? report.detail + '；登录与模型权限以实际请求为准' : report.detail };
    });
  }
  private installReports() {
    if (!this.installs) this.installs = detectInstalls(this.probe);
    return this.installs;
  }
  snapshot(): Snapshot {
    return { settings: this.store.settings(), messages: this.store.messages(), tasks: this.store.tasks(), approvals: [...this.approvals.values()].map(({ answer: _, ...a }) => a), availability: this.availability(), quota: this.quotaData };
  }
  private publish() { if (!this.closing) this.emit('snapshot', this.snapshot()); }
  settings(value: Settings) {
    if (!value || !['demo', 'live'].includes(value.mode) || typeof value.workspace !== 'string' || typeof value.writable !== 'boolean') throw new Error('设置格式无效。');
    const workspace = value.workspace ? this.workspace(value.workspace) : '';
    this.installs = undefined;
    this.store.saveSettings({ mode: value.mode, workspace, writable: value.writable }); this.publish();
  }
  private workspace(value: string) {
    if (!value) throw new Error('请先选择工作目录，再发送真实任务。');
    try {
      if (isAbsolute(value) && statSync(value).isDirectory()) return realpathSync(value);
    } catch { /* Missing or inaccessible directories need the same recovery action. */ }
    throw new Error('工作目录不存在或无法访问，请重新选择本地项目目录。');
  }
  send(input: SendInput) {
    if (!input || typeof input.id !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(input.id)) throw new Error('消息 ID 无效。');
    if (this.store.hasMessage(input.id)) return;
    const { recipients, prompt, all } = parseMentions(input.text);
    const settings = this.store.settings();
    const available = this.availability();
    const unavailable = available.filter(item => recipients.includes(item.agentId) && !item.available);
    if (unavailable.length) throw new Error(unavailable.map(item => AGENTS.find(agent => agent.id === item.agentId)!.name + '：' + item.reason).join('\n'));
    const targets = [...new Set<AgentId>([...(all ? available.filter(item => item.available).map(item => item.agentId) : []), ...recipients])];
    if (!targets.length) throw new Error('当前没有可接收任务的员工。');
    const workspace = settings.mode === 'live' ? this.workspace(settings.workspace) : settings.workspace;
    const at = Date.now();
    this.store.transaction(() => {
      this.store.message({ id: input.id, agentId: null, role: 'user', text: input.text.trim(), at, source: settings.mode });
      for (const agentId of targets) {
        const previous = this.store.tasks().filter(t => t.source === 'live' && t.agentId === agentId && t.workspace === workspace && t.threadId).at(-1);
        this.store.task({ id: randomUUID(), messageId: input.id, agentId, prompt, workspace, writable: settings.writable, status: 'queued', createdAt: at, lastEventAt: at, result: '', source: settings.mode, threadId: previous?.threadId });
      }
    });
    this.publish(); void this.next();
  }
  private update(task: Task, values: Partial<Task>) { Object.assign(task, values, { lastEventAt: Date.now() }); this.store.task(task); this.publish(); }
  private async next() {
    if (this.active || this.closing) return;
    const task = this.store.tasks().find(t => t.status === 'queued');
    if (!task) return;
    this.active = task;
    this.update(task, { status: 'running', startedAt: Date.now() });
    const reply: Message = { id: randomUUID(), role: 'agent', agentId: task.agentId, text: '', taskId: task.id, source: task.source, at: Date.now() };
    const text = (value: string) => { if (task.status === 'cancelled' || this.closing) return; reply.text = value; this.store.message(reply); this.update(task, { result: value }); };
    try {
      if (task.source === 'demo') {
        const abort = this.abort = new AbortController();
        await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, this.demoDelay); abort.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('任务已取消。')); }, { once: true }); });
        text('【演示交付】收到这项工作：' + task.prompt + '\n\n这是演示适配器的回复，没有调用真实模型、修改文件或运行测试。请在真实模式中 @Codex 执行项目任务。');
      } else {
        // Re-read predecessor after queueing: a prior task may only now have created its thread.
        task.threadId = this.store.tasks().filter(t => t.id !== task.id && t.source === 'live' && t.workspace === task.workspace && t.agentId === task.agentId && t.threadId).at(-1)?.threadId;
        const Run = task.agentId === 'codex' ? CodexRun : task.agentId === 'grok' ? GrokRun : undefined;
        if (!Run) throw new Error(AGENTS.find(agent => agent.id === task.agentId)!.name + ' 已识别，执行适配尚未接入。');
        const run = this.runner = new Run();
        const original = this.store.messageById(task.messageId)?.text || task.prompt;
        await run.run({ ...task, prompt: executionPrompt(task.agentId, original) }, { mode: 'live', workspace: task.workspace, writable: task.writable }, {
          text,
          activity: activity => { if (task.status !== 'cancelled' && !this.closing) this.update(task, { activity }); },
          thread: id => this.update(task, { threadId: id }),
          approval: (id, kind, description, answer) => {
            if (task.status === 'cancelled' || this.closing) { answer(false); return; }
            const approvalId = task.id + ':' + id;
            this.approvals.set(approvalId, { id: approvalId, taskId: task.id, agentId: task.agentId, kind, description, answer });
            this.update(task, { status: 'waiting_approval' });
          },
        });
      }
      if (task.status !== 'cancelled') this.update(task, { status: 'awaiting_review', finishedAt: Date.now(), result: task.result || '执行已结束，没有文本输出。请检查项目成果后验收。' });
    } catch (error) {
      if (this.closing) return;
      if (task.status !== 'cancelled') {
        const message = error instanceof Error ? error.message : '任务执行失败。';
        text('本次执行未完成：' + message);
        this.update(task, { status: 'failed', finishedAt: Date.now() });
      }
    } finally {
      for (const [id, approval] of this.approvals) if (approval.taskId === task.id) this.approvals.delete(id);
      this.active = undefined; this.runner = undefined; this.abort = undefined;
      this.publish(); if (!this.closing) void this.next();
    }
  }
  approve(id: string, allow: boolean) {
    if (typeof allow !== 'boolean') throw new Error('审批结果无效。');
    const approval = this.approvals.get(id); if (!approval) throw new Error('此审批已失效，请刷新任务状态。');
    this.approvals.delete(id); approval.answer(allow);
    if (this.active?.id === approval.taskId) this.update(this.active, { status: [...this.approvals.values()].some(a => a.taskId === approval.taskId) ? 'waiting_approval' : 'running' });
    this.publish();
  }
  async cancel(id: string) {
    const task = this.active?.id === id ? this.active : this.store.tasks().find(t => t.id === id);
    if (!task || !['queued', 'running', 'waiting_approval'].includes(task.status)) throw new Error('此任务当前不能取消。');
    this.update(task, { status: 'cancelled', finishedAt: Date.now() });
    if (this.active?.id === id) { this.abort?.abort(); await this.runner?.cancel(); }
  }
  accept(id: string) {
    const task = this.store.tasks().find(t => t.id === id);
    if (!task || task.status !== 'awaiting_review') throw new Error('只有待验收任务可以验收。');
    this.update(task, { status: 'accepted' });
  }
  async quota() { this.quotaData = { data: await readCodexQuota(), updatedAt: Date.now(), source: 'Codex account/rateLimits/read' }; this.publish(); }
  close() { this.closing = true; this.abort?.abort(); this.runner?.close(); }
}
