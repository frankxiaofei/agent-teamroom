import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { AGENTS } from './agents.js';
import { executionPrompt, parseMentions } from './mentions.js';
import { CodexRun, codexCommand, readCodexQuota } from './codex.js';
import { Store } from './store.js';
import { Discussions, DISCUSSION_INSTRUCTION, discussionRequest, type Runner } from './discussions.js';
import { dailyCutoff, makeReport, persistReport, scheduledReports, saveReporting } from './reports.js';
import { DEFAULT_REPORTING, type AgentId, type Approval, type Availability, type DiscussionInput, type Message, type Mode, type Quota, type Report, type Reporting, type SendInput, type Settings, type Snapshot, type Task } from './types.js';

export class Teamroom extends EventEmitter {
  private approvals = new Map<string, Approval & { answer: (allow: boolean) => void }>();
  private active?: Task;
  private runner?: Runner;
  private abort?: AbortController;
  private closing = false;
  private quotaData?: Quota;
  private codexInstalled?: boolean;
  private discussions: Discussions;
  constructor(readonly store: Store, private demoDelay = 650, private runnerFactory?: (agentId: AgentId) => Runner) {
    super();
    if (!store.messages().length) this.seed();
    this.discussions = new Discussions(store, source => this.availability(source), id => this.makeRunner(id), d => { this.publish(); if (d.status === 'needs_decision') this.emit('notice', { source: d.source, title: '讨论等你决定', body: d.question, discussionId: d.id }); }, (task, values) => this.update(task, values));
  }
  private seed() {
    const at = Date.now();
    this.store.message({ id: randomUUID(), role: 'system', agentId: null, text: '欢迎来到 Teamroom。输入 @ 选择员工，在群里交代工作。当前为演示模式，可在设置中切换到真实 Codex。', at, source: 'demo' });
    const task: Task = { id: randomUUID(), messageId: randomUUID(), agentId: 'cursor', prompt: '设置页面交互稿', workspace: '', writable: false, status: 'awaiting_review', source: 'demo', createdAt: at - 48000, startedAt: at - 47000, finishedAt: at, lastEventAt: at, result: '演示交付：设置页面交互稿和改动说明已准备好，请老板验收。' };
    this.store.task(task);
    this.store.message({ id: randomUUID(), role: 'agent', agentId: 'cursor', taskId: task.id, text: task.result, at: at + 1, source: 'demo' });
  }
  availability(mode = this.store.settings().mode): Availability[] {
    return AGENTS.map(a => {
      if (a.id === 'workbuddy') return { agentId: a.id, available: false, reason: '后续接入，当前无法接收任务' };
      if (mode === 'demo') return { agentId: a.id, available: true, reason: '演示适配器' };
      if (a.id !== 'codex') return { agentId: a.id, available: false, reason: '真实适配器在后续里程碑交付' };
      if (this.codexInstalled === undefined) { try { codexCommand(); this.codexInstalled = true; } catch { this.codexInstalled = false; } }
      return { agentId: a.id, available: this.codexInstalled, reason: this.codexInstalled ? '检测到 CLI；登录与模型权限以实际请求为准' : '未检测到 Codex CLI，请在外部终端安装并登录' };
    });
  }
  snapshot(): Snapshot {
    return { settings: this.store.settings(), messages: this.store.messages(), tasks: this.store.tasks(), approvals: [...this.approvals.values()].map(({ answer: _, ...a }) => a), availability: this.availability(), quota: this.quotaData, reporting: this.store.value('reporting', DEFAULT_REPORTING), reports: this.store.reports(), discussions: this.store.discussions() };
  }
  private publish() { if (!this.closing) this.emit('snapshot', this.snapshot()); }
  settings(value: Settings) {
    if (!value || !['demo', 'live'].includes(value.mode) || typeof value.workspace !== 'string' || typeof value.writable !== 'boolean') throw new Error('设置格式无效。');
    const workspace = value.workspace ? this.workspace(value.workspace) : '';
    this.codexInstalled = undefined;
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
    const { recipients, prompt } = parseMentions(input.text);
    const settings = this.store.settings();
    const unavailable = this.availability().filter(a => recipients.includes(a.agentId) && !a.available);
    if (unavailable.length) throw new Error(unavailable.map(a => AGENTS.find(x => x.id === a.agentId)!.name + '：' + a.reason).join('\n'));
    const workspace = settings.mode === 'live' ? this.workspace(settings.workspace) : settings.workspace;
    const at = Date.now();
    this.store.transaction(() => {
      this.store.message({ id: input.id, agentId: null, role: 'user', text: input.text.trim(), at, source: settings.mode });
      for (const agentId of recipients) {
        const previous = this.store.tasks().filter(t => t.source === 'live' && t.agentId === agentId && t.workspace === workspace && t.threadId).at(-1);
        this.store.task({ id: randomUUID(), messageId: input.id, agentId, prompt, workspace, writable: settings.writable, status: 'queued', createdAt: at, lastEventAt: at, result: '', source: settings.mode, threadId: previous?.threadId });
      }
    });
    this.publish(); void this.next();
  }
  private update(task: Task, values: Partial<Task>) {
    const before = task.status;
    Object.assign(task, values, { lastEventAt: Date.now() }); this.store.task(task);
    if (before !== task.status && ['waiting_approval', 'waiting_discussion', 'awaiting_review', 'failed'].includes(task.status)) {
      const event = this.store.events(task.source).at(-1)!;
      const report = makeReport(this.store, task.source, 'alert', event.at, event.at, [event], `${task.source}:alert:${event.sequence}`);
      if (persistReport(this.store, report)) this.announce(report);
    }
    this.publish();
  }
  private makeRunner(id: AgentId): Runner {
    if (this.runnerFactory) return this.runnerFactory(id);
    if (id !== 'codex') throw new Error('此员工的真实执行适配器尚未接入。');
    return new CodexRun();
  }
  private announce(report: Report) { if (!this.closing) this.emit('notice', { source: report.source, title: report.kind === 'daily' ? 'Teamroom 团队日报' : 'Teamroom 工作汇报', body: report.text, reportId: report.id }); }
  reporting(value: Reporting) { saveReporting(this.store, value); this.publish(); }
  report() {
    const now = Date.now(), source = this.store.settings().mode;
    const from = dailyCutoff(now, this.snapshot().reporting.dailyTime);
    const report = makeReport(this.store, source, 'manual', from, now, this.store.events(source).filter(e => e.at > from && e.at <= now));
    persistReport(this.store, report); this.publish();
  }
  tick(now = Date.now()) { if (this.closing) return; for (const report of scheduledReports(this.store, now)) this.announce(report); this.publish(); }
  discuss(input: DiscussionInput) { const settings = this.store.settings(); this.discussions.create(input, settings.mode === 'live' ? this.workspace(settings.workspace) : ''); void this.next(); }
  discussionReply(id: string, text: string) { this.discussions.reply(id, text); }
  discussionRound(id: string) { this.discussions.round(id); void this.next(); }
  discussionResolve(id: string, decision: string, resume: boolean) { this.discussions.resolve(id, decision, resume); void this.next(); }
  async discussionCancel(id: string) { await this.discussions.cancel(id); this.publish(); }
  private async next() {
    if (this.active || this.discussions.busy || this.closing) return;
    if (await this.discussions.next()) { if (!this.closing) void this.next(); return; }
    // Another caller may have dispatched while awaiting an empty discussion queue.
    if (this.active || this.discussions.busy || this.closing) return;
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
        task.threadId ||= this.store.tasks().filter(t => t.id !== task.id && t.source === 'live' && t.workspace === task.workspace && t.agentId === task.agentId && t.threadId).at(-1)?.threadId;
        const run = this.runner = this.makeRunner(task.agentId);
        const original = this.store.messageById(task.messageId)?.text || task.prompt;
        await run.run({ ...task, prompt: executionPrompt(task.agentId, original) + (task.discussionContext ? '\n老板确认的讨论结论：\n' + task.discussionContext : '') + DISCUSSION_INSTRUCTION }, { mode: 'live', workspace: task.workspace, writable: task.writable }, {
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
      if (task.status !== 'cancelled') {
        const request = discussionRequest(task.result);
        if (request) { this.update(task, { status: 'waiting_discussion', activity: '本轮已暂停，等待讨论结论' }); this.discussions.create({ id: randomUUID(), taskId: task.id, ...request }, task.workspace, task.agentId, task.source); }
        else this.update(task, { status: 'awaiting_review', finishedAt: Date.now(), result: task.result || '执行已结束，没有文本输出。请检查项目成果后验收。' });
      }
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
    if (!task || !['queued', 'running', 'waiting_approval', 'waiting_discussion'].includes(task.status)) throw new Error('此任务当前不能取消。');
    this.update(task, { status: 'cancelled', finishedAt: Date.now() });
    if (this.active?.id === id) { this.abort?.abort(); await this.runner?.cancel(); }
    for (const discussion of this.store.discussions().filter(d => d.taskId === id && ['queued', 'running'].includes(d.status))) await this.discussions.cancel(discussion.id);
  }
  accept(id: string) {
    const task = this.store.tasks().find(t => t.id === id);
    if (!task || task.status !== 'awaiting_review') throw new Error('只有待验收任务可以验收。');
    this.update(task, { status: 'accepted' });
  }
  async quota() { this.quotaData = { data: await readCodexQuota(), updatedAt: Date.now(), source: 'Codex account/rateLimits/read' }; this.publish(); }
  close() { this.closing = true; this.abort?.abort(); this.runner?.close(); this.discussions.close(); }
}
