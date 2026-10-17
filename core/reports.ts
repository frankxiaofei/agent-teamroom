import { randomUUID } from 'node:crypto';
import { AGENTS } from './agents.js';
import { Store } from './store.js';
import { DEFAULT_REPORTING, type Mode, type Report, type Reporting, type TaskEvent } from './types.js';

const format = (at: number) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
export function dailyCutoff(now: number, time: string) {
  const shifted = new Date(now + 8 * 3600000);
  const [hour, minute] = time.split(':').map(Number);
  const today = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), hour - 8, minute);
  return today <= now ? today : today - 86400000;
}
export function validateReporting(value: Reporting) {
  if (!value || typeof value.enabled !== 'boolean' || typeof value.notifications !== 'boolean' || !Number.isInteger(value.intervalMinutes) || value.intervalMinutes < 5 || value.intervalMinutes > 240 || typeof value.dailyTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.dailyTime)) throw new Error('汇报设置无效：间隔需为 5–240 分钟，日报时间使用 HH:mm。');
  return { enabled: value.enabled, intervalMinutes: value.intervalMinutes, dailyTime: value.dailyTime, notifications: value.notifications };
}
export function makeReport(store: Store, source: Mode, kind: Report['kind'], from: number, to: number, events: TaskEvent[], id: string = randomUUID()): Report {
  const tasks = store.tasks().filter(t => t.source === source);
  const lines = AGENTS.flatMap(agent => {
    const own = tasks.filter(t => t.agentId === agent.id);
    const delivered = new Set(events.filter(e => e.status === 'awaiting_review' && own.some(t => t.id === e.taskId)).map(e => e.taskId)).size;
    const accepted = new Set(events.filter(e => e.status === 'accepted' && own.some(t => t.id === e.taskId)).map(e => e.taskId)).size;
    const pending = own.filter(t => t.status === 'awaiting_review').length;
    const running = own.filter(t => ['queued', 'running'].includes(t.status)).length;
    const blocked = own.filter(t => ['waiting_approval', 'waiting_discussion'].includes(t.status));
    const failures = new Set(events.filter(e => ['failed', 'interrupted'].includes(e.status) && own.some(t => t.id === e.taskId)).map(e => e.taskId)).size;
    if (!own.length) return [];
    return [`${agent.name}：本期交付 ${delivered} 项，验收 ${accepted} 项，失败/中断 ${failures} 项；当前待验收 ${pending} 项，处理中 ${running} 项，阻塞 ${blocked.length} 项。`, ...own.filter(t => events.some(e => e.taskId === t.id && e.status === 'awaiting_review')).slice(-3).map(t => `  · 交付 ${t.prompt.slice(0, 70)}：${t.result.slice(0, 120) || '无文本输出，请检查成果'}（待验证）`), ...blocked.slice(-3).map(t => `  · ${t.prompt.slice(0, 90)}：${t.status === 'waiting_approval' ? '需要老板审批' : '等待讨论结论'}`)];
  });
  const discussions = store.discussions().filter(d => d.source === source && d.status !== 'resolved');
  const title = kind === 'daily' ? '团队日报' : kind === 'manual' ? '即时工作汇报' : kind === 'alert' ? '任务状态提醒' : '工作进展汇报';
  const text = `${title} · ${source === 'demo' ? '演示' : '真实记录'}\n统计区间：${format(from)} — ${format(to)}（北京时间）\n${lines.join('\n') || '本期没有 Teamroom 任务记录。'}\n讨论中 ${discussions.filter(d => ['queued', 'running'].includes(d.status)).length} 项；等老板决定 ${discussions.filter(d => d.status === 'needs_decision').length} 项。\n依据本地状态事件自动汇总；交付不等于验收，历史事件缺失不推算。`;
  return { id, source, kind, from, to, text, taskIds: [...new Set([...events.map(e => e.taskId), ...tasks.filter(t => ['waiting_approval', 'waiting_discussion', 'awaiting_review', 'failed', 'interrupted'].includes(t.status)).map(t => t.id)])] };
}
export function persistReport(store: Store, report: Report): boolean {
  if (store.hasReport(report.id)) return false;
  store.transaction(() => {
    store.report(report);
    store.message({ id: 'report-' + report.id, role: 'system', agentId: null, text: report.text, at: report.to, source: report.source, reportId: report.id });
  });
  return true;
}
interface Cursor { nextCheck: number; sequence: number; from: number; discussions: string; }
export function saveReporting(store: Store, value: Reporting, now = Date.now()) {
  const validated = validateReporting(value), previous = store.value<Reporting>('reporting', DEFAULT_REPORTING);
  store.transaction(() => {
    store.saveValue('reporting', validated);
    if (previous.intervalMinutes !== validated.intervalMinutes) for (const source of ['demo', 'live'] as const) {
      const key = 'report-cursor:' + source, cursor = store.value<Cursor | null>(key, null);
      if (cursor) store.saveValue(key, { ...cursor, nextCheck: now + validated.intervalMinutes * 60000 });
    }
  });
}
export function scheduledReports(store: Store, now: number): Report[] {
  const preferences = store.value<Reporting>('reporting', DEFAULT_REPORTING);
  if (!preferences.enabled) return [];
  const source = store.settings().mode;
  const output: Report[] = [];
  const cutoff = dailyCutoff(now, preferences.dailyTime);
  const originKey = 'report-origin:' + source;
  const origin = store.value<number | null>(originKey, null);
  if (origin === null) store.saveValue(originKey, cutoff);
  else if (cutoff > origin) {
    const daily = makeReport(store, source, 'daily', cutoff - 86400000, cutoff, store.events(source).filter(e => e.at > cutoff - 86400000 && e.at <= cutoff), `${source}:daily:${cutoff}`);
    if (persistReport(store, daily)) output.push(daily);
  }
  const key = 'report-cursor:' + source;
  const cursor = store.value<Cursor | null>(key, null);
  const sequence = store.events(source).at(-1)?.sequence || 0;
  const discussions = store.discussions().filter(d => d.source === source).map(d => `${d.id}:${d.status}:${d.round}:${d.posts.length}:${d.updatedAt}`).join('|');
  if (!cursor) { store.saveValue(key, { nextCheck: now + preferences.intervalMinutes * 60000, sequence, from: now, discussions }); return output; }
  if (now >= cursor.nextCheck) {
    const events = store.events(source, cursor.sequence);
    const changedDiscussion = discussions !== cursor.discussions;
    if (events.length || changedDiscussion) {
      const report = makeReport(store, source, 'progress', cursor.from, now, events, `${source}:progress:${cursor.nextCheck}`);
      if (persistReport(store, report)) output.push(report);
    }
    // Advance to now, rather than replaying every missed timer after sleep.
    store.saveValue(key, { nextCheck: now + preferences.intervalMinutes * 60000, sequence, from: now, discussions });
  }
  return output;
}
