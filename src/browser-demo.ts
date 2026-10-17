import { AGENTS } from '../core/agents.js';
import { parseMentions } from '../core/mentions.js';
import type { Bridge, Snapshot, Task } from '../core/types.js';

export function browserDemo(): Bridge {
  const key = 'teamroom-browser-demo-v1';
  let value: Snapshot;
  try { value = JSON.parse(localStorage.getItem(key) || 'null'); } catch { value = null as unknown as Snapshot; }
  if (!value?.messages || !value.tasks) value = { settings: { mode: 'demo', workspace: '', writable: false }, tasks: [], approvals: [], availability: AGENTS.map(a => ({ agentId: a.id, available: a.id !== 'workbuddy', reason: a.id === 'workbuddy' ? '后续接入' : '浏览器演示' })), messages: [{ id: crypto.randomUUID(), role: 'system', agentId: null, text: '欢迎来到 Teamroom 浏览器演示。@ 员工即可体验群聊；真实 Codex 和 SQLite 记录请运行桌面版本。', source: 'demo', at: Date.now() }] };
  const listeners = new Set<(s: Snapshot) => void>();
  const publish = () => { localStorage.setItem(key, JSON.stringify(value)); listeners.forEach(fn => fn(structuredClone(value))); };
  return {
    async snapshot() { return structuredClone(value); },
    async send(input) {
      if (value.messages.some(m => m.id === input.id)) return;
      const { recipients, prompt } = parseMentions(input.text);
      if (recipients.includes('workbuddy')) throw new Error('WorkBuddy 尚未接入。');
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
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
