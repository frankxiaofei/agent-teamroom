import { useState } from 'react';
import { AGENTS } from '../core/agents.js';
import type { Account } from '../core/accounts.js';
import type { Bridge, Snapshot, Task } from '../core/types.js';
export const elapsed = (ms: number) => ms < 60000 ? `${Math.round(ms / 1000)} 秒` : `${Math.round(ms / 60000)} 分钟`;
export function TaskMetrics({ task, snapshot }: { task: Task; snapshot: Snapshot }) {
  const timing = snapshot.analytics?.timings[task.id];
  return <><p className="g-hint">分类：{task.category || '未分类'} · {timing?.complete ? `执行 ${elapsed(timing.executionMs)} / 排队 ${elapsed(timing.queueMs)} / 等审批 ${elapsed(timing.approvalMs)} / 等讨论 ${elapsed(timing.discussionMs)}` : '历史事件不足，分项耗时未知'}</p>{task.usage && <p className="g-hint">输入 {task.usage.inputTokens} / 输出 {task.usage.outputTokens} tokens{task.usage.costUsd !== undefined ? ` · $${task.usage.costUsd.toFixed(4)} 估算` : ''}{task.usage.cumulative ? ' · 会话累计，不能逐任务相加' : ''}<br />{task.usage.source}</p>}</>;
}
export function EfficiencyPanel({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.analytics?.efficiency || [];
  return <section className="settings-panel"><h3>工作效率</h3><p className="g-hint">按员工、任务分类和项目分别统计执行耗时中位数；排队、审批和讨论等待单独计算。未分类任务不参与速度比较，旧记录事件不足时不估算。</p>{rows.length ? <div className="operations-table"><table><thead><tr><th>员工 / 分类 / 项目</th><th>交付样本</th><th>执行中位数</th><th>失败 / 续做</th></tr></thead><tbody>{rows.map(r => <tr key={JSON.stringify([r.agentId, r.category, r.workspace])}><td>{AGENTS.find(a => a.id === r.agentId)?.name} · {r.category}<small title={r.workspace}>{r.workspace || '演示项目'}</small></td><td>{r.samples}</td><td>{r.medianMs === null ? '样本不足或未分类' : elapsed(r.medianMs)}</td><td>{r.failures} / {r.reworks}</td></tr>)}</tbody></table></div> : <p>暂无可统计的工作记录。</p>}</section>;
}
const accountStates = { unknown: '未知', active: '正常', low: '余额不足', past_due: '欠费' };
export function AccountsPanel({ snapshot, bridge, onError }: { snapshot: Snapshot; bridge: Bridge; onError: (message: string) => void }) {
  const [label, setLabel] = useState(''), [tools, setTools] = useState<Account['tools']>([]), [state, setState] = useState<Account['state']>('unknown');
  const [balance, setBalance] = useState(''), [currency, setCurrency] = useState<Account['currency']>('USD'), [busy, setBusy] = useState(false), [editing, setEditing] = useState<string>();
  async function save() {
    setBusy(true); onError('');
    try { await bridge.account({ id: editing || crypto.randomUUID(), label, tools, state, balance: balance === '' ? undefined : Number(balance), currency, source: 'manual', updatedAt: Date.now() }); setLabel(''); setTools([]); setBalance(''); setState('unknown'); setEditing(undefined); }
    catch (error) { onError((error as Error).message); } finally { setBusy(false); }
  }
  return <section className="settings-panel"><h3>账户登记</h3><p className="g-hint">这里只保存你填写的账户别名、状态和余额，不保存密码或 API Key。同一账户关联多个工具时只记一笔余额。人工状态不代表服务商已验证，实际账单以服务商为准。</p>{(snapshot.accounts || []).map(a => <article className="g-account" key={a.id}><h4>{a.label} · {accountStates[a.state]}</h4><p>{a.tools.map(id => AGENTS.find(t => t.id === id)?.name).join('、')} · {a.balance === undefined ? '余额未知' : `${a.currency} ${a.balance.toFixed(2)}`}</p><small>来源：人工登记 · {new Date(a.updatedAt).toLocaleString('zh-CN')}</small><button className="g-button" onClick={() => { setLabel(a.label); setTools(a.tools); setState(a.state); setBalance(a.balance?.toString() || ''); setCurrency(a.currency); setEditing(a.id); }}>编辑登记</button><button className="g-button" onClick={() => void bridge.removeAccount(a.id).catch(e => onError(e.message))}>删除登记</button></article>)}<label>账户别名<input aria-label="账户别名" value={label} maxLength={80} onChange={e => setLabel(e.target.value)} placeholder="例如：我的个人订阅" /></label><div className="account-tools">{AGENTS.map(a => <label key={a.id}><input type="checkbox" checked={tools.includes(a.id)} onChange={e => setTools(e.target.checked ? [...tools, a.id] : tools.filter(id => id !== a.id))} />{a.name}</label>)}</div><label>状态<select aria-label="账户状态" value={state} onChange={e => setState(e.target.value as Account['state'])}>{Object.entries(accountStates).map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label><label>余额（未知请留空）<input aria-label="账户余额" type="number" min="0" step="any" value={balance} onChange={e => setBalance(e.target.value)} /></label><select aria-label="余额币种" value={currency} onChange={e => setCurrency(e.target.value as Account['currency'])}><option>USD</option><option>CNY</option></select><button className="g-button primary" disabled={busy} onClick={() => void save()}>保存账户登记</button></section>;
}
export function BackupPanel({ bridge, onError }: { bridge: Bridge; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  async function run(restore: boolean) { setBusy(true); onError(''); setNotice(''); try { if (restore) { if (await bridge.restore()) setNotice('已恢复记录。已切换到演示和只读模式，未自动重跑任何任务。'); } else { const file = await bridge.backup(); if (file) setNotice('备份已保存：' + file); } } catch (e) { onError((e as Error).message); } finally { setBusy(false); } }
  return <section className="settings-panel"><h3>备份与恢复</h3><p>备份包括群消息、任务、讨论、汇报和人工账户登记。文件只保存到你选择的本地位置，请妥善保管。</p><p className="g-hint">恢复前会校验数据库并自动保留当前记录的回滚副本。执行中的任务结束或取消后才能恢复；恢复后关闭写入权限。</p><div className="g-actions"><button className="g-button" disabled={busy} onClick={() => void run(false)}>导出本地备份</button><button className="g-button" disabled={busy} onClick={() => void run(true)}>从备份恢复</button></div>{notice && <p role="status">{notice}</p>}</section>;
}
