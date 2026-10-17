import { Fragment, useEffect, useRef, useState } from 'react';
import { AtSign, MessageSquare, NotebookPen, ListTodo, Wallet, Settings as SettingsIcon, Send, FolderOpen } from 'lucide-react';
import { AGENTS } from '../core/agents.js';
import { completeAllMention, mentionNames, mentionQuery, mentionsAll, parseMentions } from '../core/mentions.js';
import type { AgentId, Bridge, Message, Settings, Snapshot, Task, TaskStatus } from '../core/types.js';
import { browserDemo } from './browser-demo.js';
import { DiscussionCard, ReportCard, ReportingSettings } from './Collaboration.js';
declare global { interface Window { teamroom?: Bridge; } }
const bridge = window.teamroom || browserDemo();
const labels: Record<TaskStatus, string> = { queued: '排队中', running: '工作中', waiting_approval: '等你拍板', waiting_discussion: '等待讨论结论', awaiting_review: '待验收', accepted: '已验收', failed: '执行失败', cancelled: '已取消', interrupted: '执行中断' };
const ongoing = ['queued', 'running', 'waiting_approval', 'waiting_discussion'];
const clock = (at: number) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(at);
const day = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
const duration = (task: Task) => task.startedAt ? Math.max(0, Math.round(((task.finishedAt || Date.now()) - task.startedAt) / 1000)) + ' 秒' : '尚未开始';
function Avatar({ id, large = false }: { id: AgentId; large?: boolean }) { const agent = AGENTS.find(a => a.id === id)!; return <div className={'g-avatar a' + agent.avatar + (large ? ' large' : '')} role="img" aria-label={agent.name + ' 卡通形象与名牌'} />; }
function Body({ text }: { text: string }) { const tokens = [...AGENTS.map(agent => agent.name), 'Grok Bot', 'all', '所有人', '全体'].sort((a, b) => b.length - a.length).join('|'); return <>{text.split(new RegExp(`(@(?:${tokens}))`, 'gi')).map((part, i) => part.startsWith('@') ? <mark key={i}>{part}</mark> : part)}</>; }
type View = 'group' | 'reports' | 'records' | 'accounts' | 'settings';
const navs = [{ id: 'group', label: 'Agent 工作群', Icon: MessageSquare }, { id: 'reports', label: '每日汇报', Icon: NotebookPen }, { id: 'records', label: '工作记录', Icon: ListTodo }, { id: 'accounts', label: '账户与额度', Icon: Wallet }, { id: 'settings', label: '连接设置', Icon: SettingsIcon }] as const;

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [view, setView] = useState<View>('group');
  const [selected, setSelected] = useState<AgentId>('codex');
  const [draft, setDraft] = useState(() => localStorage.getItem('teamroom-draft') || '');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [composeMode, setComposeMode] = useState<'task' | 'discussion'>('task');
  const [discussionTaskId, setDiscussionTaskId] = useState<string>();
  const input = useRef<HTMLTextAreaElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  useEffect(() => { const off = bridge.subscribe(setSnapshot); bridge.snapshot().then(setSnapshot).catch(e => setError(String(e.message))); return off; }, []);
  useEffect(() => { localStorage.setItem('teamroom-draft', draft); }, [draft]);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'instant' }); }, [snapshot?.messages.map(m => m.id + m.text.length).join('|')]);
  useEffect(() => bridge.onFocus(target => { setView('group'); setTimeout(() => { const id = target.discussionId ? 'discussion-' + target.discussionId : 'report-' + target.reportId; document.getElementById(id)?.scrollIntoView({ block: 'center' }); }, 100); }), []);
  async function action(fn: () => Promise<unknown>) { setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); } }
  if (!snapshot) return <main className="boot">{error || '正在打开 Teamroom…'}</main>;
  const settings = snapshot.settings;
  const tasks = snapshot.tasks.filter(t => t.source === settings.mode);
  const messages = snapshot.messages.filter(m => m.source === settings.mode);
  const available = (id: AgentId) => snapshot.availability.find(a => a.agentId === id)?.available;
  const agent = AGENTS.find(a => a.id === selected)!;
  const own = tasks.filter(t => t.agentId === selected);
  const latest = own.at(-1);
  const today = tasks.filter(t => day(t.finishedAt || t.createdAt) === day(Date.now()));
  const recipients = mentionNames(draft);
  const broadcast = mentionsAll(draft);
  const picks = AGENTS.filter(a => a.name.toLowerCase().startsWith(query.toLowerCase()) || a.nick.startsWith(query));
  const showAll = composeMode !== 'discussion' && (!query || ['all', '所有人', '全体'].some(token => token.startsWith(query.toLowerCase())));
  function mention(id: AgentId) {
    setSelected(id); setView('group');
    if (!available(id)) { setError(snapshot!.availability.find(a => a.agentId === id)?.reason || '工具不可用'); return; }
    if (recipients.includes(id)) { setPicker(false); setTimeout(() => input.current?.focus(), 0); return; }
    const name = AGENTS.find(a => a.id === id)!.name;
    const caret = input.current?.selectionStart ?? draft.length;
    const prefix = draft.slice(0, caret);
    const match = prefix.match(/(^|\s)@([^@\n]*)$/);
    const start = match && picker ? caret - match[2].length - 1 : caret;
    const before = draft.slice(0, start);
    const addition = (before && !/\s$/.test(before) ? ' ' : '') + '@' + name + ' ';
    setDraft(before + addition + draft.slice(caret)); setPicker(false); setError('');
    setTimeout(() => { input.current?.focus(); input.current?.setSelectionRange(before.length + addition.length, before.length + addition.length); }, 0);
  }
  function mentionAll() {
    setView('group'); setPicker(false); setError('');
    if (broadcast) { setTimeout(() => input.current?.focus(), 0); return; }
    const caret = input.current?.selectionStart ?? draft.length;
    const prefix = draft.slice(0, caret);
    const match = prefix.match(/(^|\s)@([^@\n]*)$/);
    const start = match && picker ? caret - match[2].length - 1 : caret;
    const before = draft.slice(0, start);
    const addition = (before && !/\s$/.test(before) ? ' ' : '') + '@all ';
    setDraft(before + addition + draft.slice(caret));
    setTimeout(() => { input.current?.focus(); input.current?.setSelectionRange(before.length + addition.length, before.length + addition.length); }, 0);
  }
  function updateDraft(value: string, caret: number) {
    const completed = completeAllMention(value, caret);
    if (completed) {
      setDraft(completed.text); setPicker(false); setQuery(''); setError('');
      setTimeout(() => input.current?.setSelectionRange(completed.caret, completed.caret), 0);
      return;
    }
    setDraft(value); setError('');
    const active = mentionQuery(value, caret);
    if (!active) { setPicker(false); setQuery(''); return; }
    const hits = AGENTS.filter(a => a.name.toLowerCase().startsWith(active.query.toLowerCase()) || a.nick.startsWith(active.query));
    const allHit = !active.query || ['all', '所有人', '全体'].some(token => token.toLowerCase().startsWith(active.query.toLowerCase()));
    setQuery(active.query);
    setPicker(allHit || hits.length > 0);
  }
  async function send() {
    if (sending) return;
    setSending(true); setError('');
    try {
      const parsed = parseMentions(draft);
      if (composeMode === 'discussion' && parsed.all) throw new Error('讨论最多邀请两位员工，不能使用 @all。');
      const current = (await bridge.snapshot()).settings;
      if (current.mode === 'live' && !current.workspace && !await chooseWorkspace()) return;
      if (composeMode === 'discussion') {
        await bridge.discuss({ id: crypto.randomUUID(), question: parsed.prompt, participants: parsed.recipients, taskId: discussionTaskId });
        setDiscussionTaskId(undefined);
      } else {
        try {
          await bridge.send({ id: crypto.randomUUID(), text: draft });
        } catch (error) {
          const message = error instanceof Error ? error.message : '发送失败';
          if (current.mode !== 'live' || !/工作目录|项目目录/.test(message) || !await chooseWorkspace()) throw error;
          await bridge.send({ id: crypto.randomUUID(), text: draft });
        }
      }
      setDraft(''); setPicker(false);
    }
    catch (e) { setError(e instanceof Error ? e.message : '发送失败'); }
    finally { setSending(false); input.current?.focus(); }
  }
  async function chooseWorkspace() {
    const current = (await bridge.snapshot()).settings;
    const workspace = await bridge.chooseWorkspace();
    if (!workspace) return false;
    await bridge.settings({ ...current, workspace });
    return true;
  }
  function showTask(id: string) { setView('records'); setTimeout(() => document.getElementById('task-' + id)?.scrollIntoView({ block: 'center' }), 80); }
  function TaskCard({ task }: { task: Task }) {
    const approvals = snapshot!.approvals.filter(a => a.taskId === task.id);
    return <section className="g-task" id={'task-' + task.id}><div className="g-task-top"><strong>{AGENTS.find(a => a.id === task.agentId)!.name}</strong><span className={'g-state ' + (task.status === 'waiting_approval' || task.status === 'awaiting_review' ? 'wait' : '')}>{labels[task.status]}</span></div><p>{task.prompt}</p><p>{task.activity ? task.activity + ' · ' : ''}执行 {duration(task)} · 最近活动 {clock(task.lastEventAt)}{task.source === 'demo' ? ' · 演示' : ''}</p>{approvals.map(a => <div className="g-warning" key={a.id}><pre>{a.description}</pre><div className="g-actions"><button className="g-button primary" onClick={() => action(() => bridge.approve(a.id, true))}>仅批准本次</button><button className="g-button" onClick={() => action(() => bridge.approve(a.id, false))}>拒绝</button></div></div>)}<div className="g-actions">{['awaiting_review', 'failed', 'interrupted'].includes(task.status) && <button className="g-button" onClick={() => { setComposeMode('discussion'); setDiscussionTaskId(task.id); setDraft('@' + AGENTS.find(a => a.id === task.agentId)!.name + ' 围绕这项任务讨论：' + task.prompt); setView('group'); }}>就此发起讨论</button>}{task.status === 'awaiting_review' && <button className="g-button primary" onClick={() => action(() => bridge.accept(task.id))}>验收通过</button>}{ongoing.includes(task.status) && <button className="g-button" onClick={() => action(() => bridge.cancel(task.id))}>取消任务</button>}</div></section>;
  }
  function ChatMessage({ message }: { message: Message }) {
    if (message.reportId) { const report = snapshot!.reports.find(r => r.id === message.reportId); if (report) return <ReportCard report={report} tasks={tasks} onTask={showTask} />; }
    if (message.discussionId) { const discussion = snapshot!.discussions.find(d => d.id === message.discussionId); if (discussion) return <DiscussionCard discussion={discussion} bridge={bridge} onError={setError} onTask={showTask} />; }
    if (message.role === 'system') return <p className="system-message">{message.text}</p>;
    const mine = message.role === 'user';
    const related = tasks.filter(t => mine ? t.messageId === message.id : t.id === message.taskId && !messages.some(m => m.id === t.messageId));
    return <article className={'g-message ' + (mine ? 'mine' : '')} data-sender={mine ? 'boss' : message.agentId}>{mine ? <div className="g-boss">我</div> : <Avatar id={message.agentId!} />}<div className="g-message-main"><div className="g-message-head"><strong>{mine ? '你 · 老板' : AGENTS.find(a => a.id === message.agentId)?.name}</strong><time>{clock(message.at)}</time><span className="source-label">{message.source === 'demo' ? '演示' : '真实'}</span></div><div className="g-bubble"><Body text={message.text} />{related.map(t => <TaskCard key={t.id} task={t} />)}</div></div></article>;
  }
  const headers: Record<View, [string, string]> = { group: ['Agent 工作群', `你与 ${AGENTS.length} 位员工在这里沟通 · @ 指定员工，或 @all`], reports: ['每日工作汇报', '先看成果，再看阻塞，最后决定下一步'], records: ['工作记录', '接收、执行结束和验收分别记录'], accounts: ['账户与额度', '数据带来源与更新时间，未知不会显示为欠费'], settings: ['连接设置', '演示与真实任务分别保存 · 默认只读权限'] };
  return <div className="g-window"><div className="g-titlebar"><span className="g-brand"><b>T</b>TEAMROOM</span><span className="g-demo">{window.teamroom ? '本地桌面工作台' : '浏览器演示'}</span><button className={'mode-button ' + (settings.mode === 'live' ? 'live' : '')} onClick={() => setView('settings')}>{settings.mode === 'demo' ? '演示模式' : '真实模式 · 本机 Agent'}</button></div><div className="g-shell"><nav className="g-nav"><div className="g-org">我的 Agent 公司<small>老板与 {AGENTS.length} 位员工</small></div>{navs.map(({ id, label, Icon }) => <button className="g-navbutton" key={id} aria-pressed={view === id} onClick={() => { setView(id); setError(''); }}><Icon size={15} />{label}</button>)}<div className="g-navfoot">@ 谁，谁接收<br />成果在群内汇报</div></nav><main className="g-main"><header className="g-head"><div className="g-kicker">我的公司 / 工作空间</div><h2>{headers[view][0]}</h2><p className="g-sub">{headers[view][1]}</p></header><div className={'g-content ' + (view === 'group' ? 'chat-content' : 'page-content')}>{error && <div className="error-banner" role="alert">{error}</div>}{view === 'group' && <><div className="g-pinned"><span className="g-pinmark">助</span><div><strong>今日简报 · {today.filter(t => ['awaiting_review', 'accepted'].includes(t.status)).length} 项交付</strong><small>{tasks.filter(t => ongoing.includes(t.status)).length} 项处理中 · {tasks.filter(t => t.status === 'awaiting_review').length} 项待验收 · {snapshot.approvals.length} 项待审批{settings.mode === 'demo' ? ' · 演示数据' : ''}</small></div></div><div className="group-toolbar"><button className="g-button" aria-pressed={composeMode === 'discussion'} onClick={() => { setComposeMode(composeMode === 'discussion' ? 'task' : 'discussion'); setDiscussionTaskId(undefined); }}>{composeMode === 'discussion' ? '返回任务沟通' : '发起讨论'}</button><button className="g-button" onClick={() => void action(() => bridge.report())}>立即汇报</button><small>{composeMode === 'discussion' ? '讨论模式：@ 最多两位员工，只读分析' + (discussionTaskId ? ' · 已关联原任务' : '') : '任务模式：@ 谁，谁接收'}</small></div><div className="g-feed" ref={feed} aria-label="群聊消息">{messages.length ? messages.map(m => <Fragment key={m.id}>{ChatMessage({ message: m })}</Fragment>) : <p className="system-message">在下方 @Codex，开始第一项真实工作。</p>}{snapshot.discussions.filter(d => d.source === settings.mode && d.status !== 'resolved' && !messages.some(m => m.discussionId === d.id)).map(d => <DiscussionCard key={d.id} discussion={d} bridge={bridge} onError={setError} onTask={showTask} />)}</div><section className="g-composer"><div className="g-compose-top"><button className="g-mention-button" onClick={() => { setPicker(!picker); setQuery(''); input.current?.focus(); }}><AtSign size={15} />提及员工</button><span className="g-recipients">{broadcast ? '接收人：全体当前可用员工' : recipients.length ? '接收人：' + recipients.map(id => AGENTS.find(a => a.id === id)!.name).join('、') : '尚未指定接收人'}</span></div>{picker && <div className="g-picker"><p className="g-picker-title">选择接收人，可 @ 多位员工或 @all</p><div className="g-picker-grid">{showAll && <button className="g-pick" onClick={mentionAll} disabled={!snapshot.availability.some(item => item.available)}><span className="g-avatar all" role="img" aria-label="全体可用员工" /><span><strong>@all</strong><small>全体当前可用员工</small></span></button>}{picks.map(a => <button className="g-pick" key={a.id} disabled={!available(a.id)} onClick={() => mention(a.id)}><Avatar id={a.id} /><span><strong>{a.name}</strong><small>{available(a.id) ? a.job : snapshot.availability.find(item => item.agentId === a.id)?.reason.includes('已检测到') ? '已识别' : '尚未接入'}</small></span></button>)}</div></div>}<textarea ref={input} aria-label="群消息" placeholder="@Codex 检查登录模块，完成后把测试结果发到群里。" maxLength={8000} value={draft} onChange={e => { if (e.nativeEvent instanceof InputEvent && e.nativeEvent.isComposing) { setDraft(e.target.value); return; } updateDraft(e.target.value, e.target.selectionStart ?? e.target.value.length); }} onCompositionEnd={e => updateDraft(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)} onKeyDown={e => { if (e.nativeEvent.isComposing || e.keyCode === 229) return; if (e.key === 'Escape') setPicker(false); if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); void send(); } }} /><div className="g-compose-bottom">{settings.mode === 'live' ? <button className="g-button workspace-button" disabled={sending} onClick={() => void action(chooseWorkspace)}><FolderOpen size={14} />{settings.workspace ? '切换工作目录' : '选择工作目录'}</button> : null}<span className="g-hint">Enter 发送 · Shift + Enter 换行</span><button className="g-button primary send" disabled={sending} onClick={() => void send()}><Send size={14} />{sending ? '发送中…' : composeMode === 'discussion' ? '发送讨论问题' : '发送到群里'}</button></div><p className="composer-note">{settings.mode === 'demo' ? '演示模式不会调用真实工具、修改文件或运行测试。' : '工作目录：' + (settings.workspace || '发送时选择本地项目目录') + ' · ' + (settings.writable ? '允许在目录内写入，必要操作由你审批' : '只读权限')}</p></section></>}{view === 'reports' && <article className="g-report"><div className="g-report-title"><Avatar id={selected} /><div><h3>{agent.name} · 今日工作汇报</h3><span className="g-state">{latest ? labels[latest.status] : '尚无任务'}</span></div></div><p>今日交付 {today.filter(t => t.agentId === selected && ['awaiting_review', 'accepted'].includes(t.status)).length} 项，验收 {today.filter(t => t.agentId === selected && t.status === 'accepted').length} 项。</p>{own.length ? own.slice(-10).reverse().map(t => <div key={t.id} className="report-task"><TaskCard task={t} /><p className="result-text">{t.result || '等待执行结果'}</p></div>) : <p className="g-hint">没有已记录的工作。这里只统计从 Teamroom 发起的任务。</p>}<button className="g-button primary" onClick={() => mention(selected)}>回群里 @{agent.name}</button><h3>自动汇报历史</h3>{snapshot.reports.filter(r => r.source === settings.mode).map(r => <ReportCard key={r.id} report={r} tasks={tasks} onTask={showTask} />)}<h3>讨论记录</h3>{snapshot.discussions.filter(d => d.source === settings.mode).map(d => <DiscussionCard key={d.id} discussion={d} bridge={bridge} onError={setError} onTask={showTask} />)}</article>}{view === 'records' && <>{tasks.length ? [...tasks].reverse().map(t => <article className="record" key={t.id}><TaskCard task={t} />{['failed', 'interrupted'].includes(t.status) && <p>{t.result}</p>}</article>) : <p className="system-message">当前模式没有工作记录。</p>}</>}{view === 'accounts' && <><article className="g-account"><h3>Codex · 账户额度</h3><button className="g-button" onClick={() => action(() => bridge.quota())}>读取额度</button>{snapshot.quota ? <><pre className="quota-data">{JSON.stringify(snapshot.quota.data, null, 2)}</pre><small>{snapshot.quota.source} · {clock(snapshot.quota.updatedAt)} 更新</small></> : <p>尚未获取，不代表额度为零或账户欠费。</p>}</article><article className="g-account"><h3>其他工具</h3><p>余额、订阅和实际账单接口尚未接入。</p><small>Token 消耗与实际账单不能互相替代。</small></article></>}{view === 'settings' && <><ConnectionSettings settings={settings} onSave={value => action(() => bridge.settings(value))} onError={setError} /><ReportingSettings value={snapshot.reporting} bridge={bridge} onError={setError} /></>}</div></main><aside className="g-members"><div className="g-members-head"><h3>群成员</h3><small>{AGENTS.length} 位员工</small></div><div className="g-roster">{AGENTS.map(a => { const current = tasks.filter(t => t.agentId === a.id).at(-1); return <button key={a.id} className="g-member" aria-pressed={selected === a.id} aria-label={(view === 'group' ? '在群里提及 ' : '查看 ') + a.name} onClick={() => view === 'group' ? mention(a.id) : setSelected(a.id)}><Avatar id={a.id} /><span><strong>{a.name}</strong><small>{a.nick} · {available(a.id) ? current ? labels[current.status] : '待命' : '尚未接入'}</small></span><span className="g-member-at">@</span></button>; })}</div><section className="g-profile"><Avatar id={selected} large /><p className="g-profile-name">{agent.name}</p><p className="g-profile-role">{agent.nick} · {agent.job}</p><div className="g-profile-label">正在做什么</div><p>{latest?.prompt || snapshot.availability.find(a => a.agentId === selected)?.reason}</p><div className="g-profile-numbers"><div><strong>{own.filter(t => ['accepted', 'awaiting_review'].includes(t.status)).length} 项</strong><small>累计交付</small></div><div><strong>{latest ? duration(latest) : '—'}</strong><small>最近任务执行</small></div></div><button className="g-button" onClick={() => setView('reports')}>查看今日日报</button><p className="g-note">原创概念形象 · 非官方吉祥物</p></section></aside></div></div>;
}

function ConnectionSettings({ settings, onSave, onError }: { settings: Settings; onSave: (value: Settings) => Promise<void>; onError: (error: string) => void }) {
  const [value, setValue] = useState(settings);
  return <section className="settings-panel"><h3>执行模式</h3><label><input type="radio" name="mode" checked={value.mode === 'demo'} onChange={() => setValue({ ...value, mode: 'demo' })} />演示模式：体验多员工群聊，不调用真实工具</label><label><input type="radio" name="mode" checked={value.mode === 'live'} onChange={() => setValue({ ...value, mode: 'live' })} />真实模式：识别本机已安装的 Agent，Codex 与 Grok 可执行</label><h3>工作目录</h3><p className="g-hint">选择允许 Agent 读取或修改的项目目录。</p><div className="workspace-field"><input aria-label="工作目录" value={value.workspace} readOnly placeholder="尚未选择项目目录" /><button className="g-button" onClick={async () => { try { const path = await bridge.chooseWorkspace(); if (path) setValue({ ...value, workspace: path }); } catch (e) { onError((e as Error).message); } }}><FolderOpen size={15} />选择目录</button></div><label><input type="checkbox" checked={value.writable} onChange={e => setValue({ ...value, writable: e.target.checked })} />允许修改工作目录中的文件（默认关闭）</label><p className="g-hint">Codex 保留自身沙箱和审批。Teamroom 不读取或保存登录凭据，不会自动批准操作。</p><button className="g-button primary" onClick={() => void onSave(value)}>保存连接设置</button><h3>工具接入状态</h3><p>Codex 与 Grok 检测到官方 CLI 后可以接收真实任务。Claude Code、OpenCode、Cursor、Cline、WorkBuddy 会显示是否已安装；执行适配尚未接入时不能派发。</p></section>;
}
