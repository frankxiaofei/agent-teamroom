import { AGENTS } from '../core/agents.js';
import { parseMentions } from '../core/mentions.js';
import { DEFAULT_REPORTING, type Bridge, type Discussion, type Snapshot, type Task } from '../core/types.js';

export function browserDemo(): Bridge {
  const key = 'teamroom-browser-demo-v1';
  let value: Snapshot;
  try { value = JSON.parse(localStorage.getItem(key) || 'null'); } catch { value = null as unknown as Snapshot; }
  if (!value?.messages || !value.tasks) value = { settings: { mode: 'demo', workspace: '', writable: false }, tasks: [], approvals: [], availability: AGENTS.map(a => ({ agentId: a.id, available: true, reason: '浏览器演示' })), messages: [{ id: crypto.randomUUID(), role: 'system', agentId: null, text: '欢迎来到 Teamroom 浏览器演示。@ 员工即可体验群聊；真实 Codex 和 SQLite 记录请运行桌面版本。', source: 'demo', at: Date.now() }], reporting: DEFAULT_REPORTING, reports: [], discussions: [] };
  value.reporting ||= DEFAULT_REPORTING; value.reports ||= []; value.discussions ||= [];
  const listeners = new Set<(s: Snapshot) => void>();
  const availability = () => AGENTS.map(agent => ({ agentId: agent.id, available: true, reason: '浏览器演示' }));
  const publish = () => { localStorage.setItem(key, JSON.stringify(value)); listeners.forEach(fn => fn(structuredClone(value))); };
  return {
    async snapshot() { return structuredClone({ ...value, availability: availability() }); },
    async send(input) {
      if (value.messages.some(m => m.id === input.id)) return;
      const parsed = parseMentions(input.text);
      const open = new Set(availability().filter(item => item.available).map(item => item.agentId));
      const blocked = parsed.recipients.filter(id => !open.has(id));
      if (blocked.length) throw new Error(blocked.map(id => AGENTS.find(agent => agent.id === id)!.name + ' 尚未接入。').join('\n'));
      const recipients = [...new Set([...(parsed.all ? open : []), ...parsed.recipients])];
      if (!recipients.length) throw new Error('当前没有可接收任务的员工。');
      const { prompt } = parsed;
      const now = Date.now();
      value.messages.push({ id: input.id, role: 'user', agentId: null, text: input.text, at: now, source: 'demo' });
      recipients.forEach(agentId => {
        const task: Task = { id: crypto.randomUUID(), messageId: input.id, agentId, prompt, workspace: '', writable: false, status: 'awaiting_review', createdAt: now, startedAt: now, finishedAt: now, lastEventAt: now, result: '【浏览器演示】收到，老板。这里模拟接收与交付，没有调用真实工具或修改本地文件。', source: 'demo' };
        value.tasks.push(task); value.messages.push({ id: crypto.randomUUID(), role: 'agent', agentId, text: task.result, taskId: task.id, at: now + 1, source: 'demo' });
      }); publish();
    },
    async settings(settings) { if (settings.mode !== 'demo') throw new Error('真实模式仅桌面版本可用，请运行 npm run dev。'); value.settings = settings; publish(); },
    async chooseWorkspace() { throw new Error('本地目录选择仅桌面版本可用。'); },
    async cancel() { throw new Error('浏览器演示没有正在执行的后台进程。'); },
    async accept(id) { const task = value.tasks.find(t => t.id === id); if (!task || task.status !== 'awaiting_review') throw new Error('任务当前不可验收。'); task.status = 'accepted'; publish(); },
    async approve() { throw new Error('浏览器演示没有真实审批请求。'); },
    async quota() { throw new Error('浏览器演示无法查询账户额度。'); },
    async account() { throw new Error('账户登记请使用桌面版，浏览器演示不保存账户信息。'); },
    async removeAccount() { throw new Error('账户登记请使用桌面版。'); },
    async importBills() { throw new Error('账单导入请使用桌面版。'); },
    async billTemplate() { throw new Error('账单模板请使用桌面版。'); },
    async removeBill() { throw new Error('账单管理请使用桌面版。'); },
    async checkUpdates() { throw new Error('更新检查请使用桌面版。'); },
    async openUpdate() { throw new Error('更新检查请使用桌面版。'); },
    async installUpdate() { throw new Error('签名更新请使用已安装的桌面版。'); },
    async cancelUpdate() {},
    async backup() { throw new Error('SQLite 备份请使用桌面版。'); },
    async restore() { throw new Error('SQLite 恢复请使用桌面版。'); },
    async reporting(settings) { value.reporting = settings; publish(); },
    async report() { const now = Date.now(), id = crypto.randomUUID(); const text = '【浏览器演示】即时工作汇报\n交付 ' + value.tasks.filter(t => t.status === 'awaiting_review').length + ' 项；验收 ' + value.tasks.filter(t => t.status === 'accepted').length + ' 项。\n依据浏览器演示记录，完整定时汇报请使用桌面版。'; value.reports.push({ id, kind: 'manual', source: 'demo', from: now, to: now, text, taskIds: value.tasks.map(t => t.id) }); value.messages.push({ id: 'report-' + id, role: 'system', agentId: null, source: 'demo', at: now, text, reportId: id }); publish(); },
    async discuss(input) {
      if (value.discussions.some(d => d.id === input.id)) return;
      if (!input.question.trim() || !input.participants.length || input.participants.length > 2 || input.participants.some(id => !AGENTS.some(a => a.id === id))) throw new Error('请选择最多两位可用员工并填写问题。');
      const now = Date.now(); const d: Discussion = { ...input, initiator: null, source: 'demo', status: 'needs_decision', round: 1, posts: input.participants.map(agentId => ({ id: crypto.randomUUID(), agentId, kind: 'reply', round: 1, at: now, text: '【浏览器演示】建议先确认需求和证据，没有调用真实工具。' })), createdAt: now, updatedAt: now, workspace: '' };
      value.discussions.push(d); value.messages.push({ id: 'discussion-' + d.id, role: 'user', agentId: null, source: 'demo', at: now, text: d.question, discussionId: d.id }); publish();
    },
    async discussionReply(id, text) { const d = value.discussions.find(d => d.id === id); if (!d || d.status !== 'needs_decision' || !text.trim()) throw new Error('讨论当前不可回复。'); d.posts.push({ id: crypto.randomUUID(), agentId: null, kind: 'boss', text, round: d.round, at: Date.now() }); publish(); },
    async discussionRound() { throw new Error('完整讨论轮次请使用桌面版本；这里仅展示演示卡片。'); },
    async discussionResolve(id, decision, resume) { const d = value.discussions.find(d => d.id === id); if (!d || d.status !== 'needs_decision' || !decision.trim()) throw new Error('请填写结论。'); if (resume) throw new Error('浏览器演示不执行原任务，请使用桌面版本。'); d.decision = decision; d.status = 'resolved'; publish(); },
    async discussionCancel() { throw new Error('浏览器演示没有正在运行的讨论。'); },
    onFocus() { return () => {}; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
