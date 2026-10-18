import { AGENTS } from './agents.js';
import type { AgentId, Mode, Task, TaskEvent } from './types.js';
export interface TaskTiming { executionMs: number; queueMs: number; approvalMs: number; discussionMs: number; complete: boolean; }
export interface Efficiency { agentId: AgentId; category: string; workspace: string; samples: number; medianMs: number | null; failures: number; reworks: number; }
export interface Analytics { today: { agentId: AgentId; delivered: number; accepted: number }[]; timings: Record<string, TaskTiming>; efficiency: Efficiency[]; }
export function analytics(tasks: Task[], events: TaskEvent[], source: Mode, now = Date.now()): Analytics {
  const own = tasks.filter(t => t.source === source), history = events.filter(e => e.source === source);
  const since = Math.floor((now + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000;
  const today = AGENTS.map(a => {
    const ids = new Set(own.filter(t => t.agentId === a.id).map(t => t.id));
    const count = (status: string) => new Set(history.filter(e => ids.has(e.taskId) && e.at >= since && e.at <= now && e.status === status).map(e => e.taskId)).size;
    return { agentId: a.id, delivered: count('awaiting_review'), accepted: count('accepted') };
  });
  const timings: Record<string, TaskTiming> = {}, groups = new Map<string, Efficiency & { values: number[] }>();
  for (const t of own) {
    const rows = history.filter(e => e.taskId === t.id).sort((a, b) => a.sequence - b.sequence);
    const timing: TaskTiming = { executionMs: 0, queueMs: 0, approvalMs: 0, discussionMs: 0, complete: rows[0]?.status === 'queued' && rows[0].at === t.createdAt && !rows.some(e => e.status === 'interrupted') };
    for (let i = 0; i < rows.length; i++) {
      const elapsed = Math.max(0, Math.min(now, rows[i + 1]?.at ?? now) - rows[i].at);
      const key = ({ running: 'executionMs', queued: 'queueMs', waiting_approval: 'approvalMs', waiting_discussion: 'discussionMs' } as const)[rows[i].status as 'running'];
      if (key) timing[key] += elapsed;
    }
    timings[t.id] = timing;
    const category = t.category || '未分类', key = JSON.stringify([t.agentId, category, t.workspace]);
    const group = groups.get(key) || { agentId: t.agentId, category, workspace: t.workspace, samples: 0, medianMs: null, failures: 0, reworks: 0, values: [] };
    if (timing.complete && ['awaiting_review', 'accepted'].includes(t.status) && rows.some(e => e.status === 'awaiting_review')) group.values.push(timing.executionMs);
    group.failures += rows.filter(e => e.status === 'failed').length;
    group.reworks += Math.max(0, rows.filter(e => e.status === 'queued').length - 1); groups.set(key, group);
  }
  const efficiency = [...groups.values()].map(({ values, ...group }) => { values.sort((a, b) => a - b); const n = values.length; return { ...group, samples: n, medianMs: n && group.category !== '未分类' ? n % 2 ? values[Math.floor(n / 2)] : (values[n / 2 - 1] + values[n / 2]) / 2 : null }; });
  return { today, timings, efficiency };
}
