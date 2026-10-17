import { useEffect, useState } from 'react';
import { AGENTS } from '../core/agents.js';
import type { Bridge, Discussion, Report, Reporting, Task } from '../core/types.js';
const employee = (id: string | null) => AGENTS.find(a => a.id === id)?.name || '老板';
const statuses = { queued: '等待员工讨论', running: '正在讨论', needs_decision: '等老板决定', resolved: '已确认结论' };
export function ReportCard({ report, tasks, onTask }: { report: Report; tasks: Task[]; onTask: (id: string) => void }) {
  return <article className="collaboration-card report-card" id={'report-' + report.id}><strong>{report.kind === 'daily' ? '团队日报' : report.kind === 'alert' ? '任务状态提醒' : '工作汇报'} · 本地记录自动汇总</strong><p>{report.text}</p><div className="g-actions">{report.taskIds.slice(0, 8).map(id => { const task = tasks.find(t => t.id === id); return task && <button className="g-button" key={id} onClick={() => onTask(id)}>{employee(task.agentId)}：{task.prompt.slice(0, 28)}</button>; })}</div></article>;
}
export function DiscussionCard({ discussion: d, bridge, onError, onTask }: { discussion: Discussion; bridge: Bridge; onError: (text: string) => void; onTask: (id: string) => void }) {
  const [reply, setReply] = useState('');
  const [decision, setDecision] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<void>, clear?: () => void) { if (busy) return; setBusy(true); try { await fn(); clear?.(); } catch (error) { onError(error instanceof Error ? error.message : '讨论操作失败'); } finally { setBusy(false); } }
  return <article className="collaboration-card discussion-card" id={'discussion-' + d.id}>
    <div className="discussion-heading"><strong>{employee(d.initiator)} 发起讨论</strong><span className="g-state">{statuses[d.status]} · {d.round}/3 轮</span></div>
    <p className="discussion-question">{d.question}</p><small>{d.source === 'demo' ? '演示讨论' : '真实讨论'} · 只读分析 · 受邀员工：{d.participants.map(employee).join('、') || '暂无其他可用员工'}</small>
    {d.taskId && <p><button className="g-button" onClick={() => onTask(d.taskId!)}>查看原任务</button></p>}
    {d.posts.filter(p => p.kind === 'summary').slice(-1).map(post => <section key={post.id} className="discussion-post summary"><strong>{employee(post.agentId)} · 建议结论（未验证）</strong><p>{post.text}</p></section>)}
    <details className="discussion-posts"><summary>查看 {d.posts.length} 条讨论记录与依据</summary>{d.posts.map(post => <section key={post.id} className={'discussion-post ' + post.kind}><strong>{employee(post.agentId)} · {post.kind === 'summary' ? '建议结论（未验证）' : post.kind === 'boss' ? '补充意见' : post.kind === 'error' ? '状态说明' : '讨论回复'}</strong><p>{post.text}</p></section>)}</details>
    {d.status === 'needs_decision' && <div className="discussion-controls"><label>补充意见<textarea aria-label={'补充意见 ' + d.id} maxLength={4000} value={reply} onChange={e => setReply(e.target.value)} /></label><div className="g-actions"><button className="g-button" disabled={busy || !reply.trim()} onClick={() => void act(() => bridge.discussionReply(d.id, reply), () => setReply(''))}>发送补充意见</button><button className="g-button" disabled={busy || d.round >= 3 || !d.participants.length} onClick={() => void act(() => bridge.discussionRound(d.id))}>继续下一轮</button></div><label>老板确认的结论<textarea aria-label={'讨论结论 ' + d.id} maxLength={4000} value={decision} onChange={e => setDecision(e.target.value)} placeholder="填写采用的方案、仍需验证的事项和下一步" /></label><div className="g-actions"><button className="g-button" disabled={busy || !decision.trim()} onClick={() => void act(() => bridge.discussionResolve(d.id, decision, false))}>确认结论，结束讨论</button>{d.taskId && <button className="g-button primary" disabled={busy || !decision.trim()} onClick={() => void act(() => bridge.discussionResolve(d.id, decision, true))}>确认并继续原任务</button>}</div></div>}
    {['queued', 'running'].includes(d.status) && <button className="g-button" disabled={busy} onClick={() => void act(() => bridge.discussionCancel(d.id))}>取消本轮讨论</button>}
    {d.decision && <p className="confirmed-decision"><strong>老板已确认：</strong>{d.decision}</p>}
  </article>;
}
export function ReportingSettings({ value, bridge, onError }: { value: Reporting; bridge: Bridge; onError: (text: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(value); }, [value.enabled, value.intervalMinutes, value.dailyTime, value.notifications]);
  async function save() { try { await bridge.reporting(draft); setSaved(true); } catch (error) { onError(error instanceof Error ? error.message : '保存失败'); } }
  return <section className="settings-panel reporting-settings"><h3>主动汇报</h3><label><input type="checkbox" checked={draft.enabled} onChange={e => { setDraft({ ...draft, enabled: e.target.checked }); setSaved(false); }} />启用定时汇报</label><label>检查间隔（分钟）<input aria-label="汇报间隔" type="number" min={5} max={240} value={draft.intervalMinutes} onChange={e => { setDraft({ ...draft, intervalMinutes: Number(e.target.value) }); setSaved(false); }} /></label><label>日报时间（北京时间）<input aria-label="日报时间" type="time" value={draft.dailyTime} onChange={e => { setDraft({ ...draft, dailyTime: e.target.value }); setSaved(false); }} /></label><label><input type="checkbox" checked={draft.notifications} onChange={e => { setDraft({ ...draft, notifications: e.target.checked }); setSaved(false); }} />桌面提醒：交付、失败、审批、讨论待决</label><p>有状态变化才发送进度汇报；日报统计前一日指定时刻至当日指定时刻。汇报依据本地记录，不调用模型。</p><p>桌面关闭窗口后继续驻留托盘。彻底退出或休眠期间，下次运行合并补报。浏览器演示不运行后台定时器。</p><button className="g-button primary" onClick={() => void save()}>保存汇报设置</button>{saved && <span role="status"> 已保存</span>}</section>;
}
