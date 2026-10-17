import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../core/store.js';
import { Teamroom } from '../core/service.js';
import { discussionRequest, type Runner } from '../core/discussions.js';
import type { AgentId, Settings, Task, Discussion } from '../core/types.js';
const wait = async (fn: () => boolean) => { for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error('Discussion did not settle'); };
const live = (factory: (id: AgentId) => Runner) => {
  const store = new Store(':memory:'); const room = new Teamroom(store, 1, undefined, factory);
  room.availability = () => ['codex', 'claude'].map(id => ({ agentId: id as AgentId, available: true, reason: 'protocol test fixture' }));
  room.settings({ mode: 'live', workspace: process.cwd(), writable: true }); return { store, room };
};
test('boss discussion is separate from task dispatch, capped at two agents and three rounds', async () => {
  const store = new Store(':memory:'); const room = new Teamroom(store, 1); const before = store.tasks().length; const id = randomUUID();
  try {
    assert.throws(() => room.discuss({ id: randomUUID(), question: '方案？', participants: ['codex', 'claude', 'cline'] }), /最多两位/);
    assert.throws(() => room.discuss({ id: randomUUID(), question: '方案？', participants: ['workbuddy'] }), /已接入/);
    room.discuss({ id, question: '登录状态存在哪里？', participants: ['codex', 'claude'] });
    await wait(() => store.discussions()[0]?.status === 'needs_decision');
    assert.equal(store.tasks().length, before); assert.equal(store.discussions()[0].posts.length, 3);
    room.discussionReply(id, '需要跨设备共享');
    for (let round = 2; round <= 3; round++) { room.discussionRound(id); await wait(() => store.discussions()[0].status === 'needs_decision'); assert.equal(store.discussions()[0].round, round); }
    assert.throws(() => room.discussionRound(id), /最多三轮/);
    room.discussionResolve(id, '先核对现有 Redis 配置与退出策略', false); assert.equal(store.discussions()[0].status, 'resolved');
    room.report(); assert.match(store.reports()[0].text, /本地状态事件自动汇总/);
  } finally { room.close(); store.close(); }
});
test('agent uncertainty pauses at a completed turn; consultations are fresh, read-only and decline approvals', async () => {
  const calls: { task: Task; settings: Settings }[] = []; const approvals: boolean[] = [];
  const { room, store } = live(() => ({
    async run(task, settings, hooks) {
      calls.push({ task, settings });
      if (task.prompt.includes('只有确实需要讨论时') && !task.discussionContext) { hooks.thread('original-thread'); hooks.text('<teamroom-discussion>{"question":"需要跨设备共享吗？","participants":["claude"]}</teamroom-discussion>'); }
      else if (task.discussionContext) { assert.equal(task.threadId, 'original-thread'); hooks.text('根据老板确认的结论完成，等待验收'); }
      else { hooks.approval('one', 'item/fileChange/requestApproval', 'write', allow => approvals.push(allow)); hooks.text('建议明确需求，尚未验证实现'); }
    }, async cancel() {}, close() {},
  }));
  try {
    const id = randomUUID(); room.send({ id, text: '@Codex 检查登录设计' });
    await wait(() => store.discussions()[0]?.status === 'needs_decision');
    const d = store.discussions()[0], parent = store.tasks().find(t => t.messageId === id)!;
    assert.equal(parent.status, 'waiting_discussion'); assert.equal(calls.length, 3);
    assert.ok(calls.slice(1).every(c => c.settings.writable === false && c.task.writable === false && c.task.threadId === undefined)); assert.deepEqual(approvals, [false, false]);
    assert.equal(store.tasks().filter(t => t.source === 'live').length, 1);
    room.discussionResolve(d.id, '需要跨设备共享，继续检查现有实现', true);
    await wait(() => store.tasks().find(t => t.id === parent.id)?.status === 'awaiting_review');
    assert.equal(calls.length, 4); assert.equal(calls[3].settings.writable, true); assert.equal(store.discussions()[0].status, 'resolved');
  } finally { room.close(); store.close(); }
});
test('unavailable consultants never become demo responses; malformed requests and mode crossing are rejected', async () => {
  const { room, store } = live(() => ({ async run(_task, _settings, hooks) { hooks.text('<teamroom-discussion>{"question":"接口不明确","participants":["opencode"]}</teamroom-discussion>'); }, async cancel() {}, close() {} }));
  try {
    room.send({ id: randomUUID(), text: '@Codex 验证接口' }); await wait(() => store.discussions()[0]?.status === 'needs_decision');
    const d = store.discussions()[0]; assert.equal(d.participants.length, 0); assert.match(d.posts[0].text, /没有其他可用的真实员工/);
    room.settings({ mode: 'demo', workspace: '', writable: false }); assert.throws(() => room.discussionReply(d.id, '意见'), /当前模式/);
    assert.throws(() => discussionRequest('<teamroom-discussion>{"question":"a","participants":["unknown"]}</teamroom-discussion>'), /格式无效/);
  } finally { room.close(); store.close(); }
});
test('failed consultation preserves prior replies and leaves the decision to the boss', async () => {
  let count = 0; const { room, store } = live(() => ({ async run(_t, _s, hooks) { if (++count === 2) throw new Error('fixture transport failed'); hooks.text('第一位员工的依据'); }, async cancel() {}, close() {} }));
  try { room.discuss({ id: randomUUID(), question: '接口选择？', participants: ['codex', 'claude'] }); await wait(() => store.discussions()[0]?.status === 'needs_decision'); assert.equal(store.discussions()[0].posts.length, 2); assert.match(store.discussions()[0].posts[0].text, /第一位/); assert.equal(store.discussions()[0].posts[1].kind, 'error'); assert.equal(count, 2); }
  finally { room.close(); store.close(); }
});
test('restart interrupts pending discussions without replaying consultations or changing paused tasks', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'teamroom-discussion-')), 'test.db'); let store = new Store(file);
  const parent: Task = { id: 'paused-task', messageId: 'message', source: 'demo', agentId: 'codex', prompt: '等待决定', workspace: '', writable: false, status: 'waiting_discussion', createdAt: 1, lastEventAt: 1, result: '需要确认' };
  const d: Discussion = { id: randomUUID(), taskId: parent.id, source: 'demo', initiator: null, question: '检查恢复', participants: ['codex'], workspace: '', status: 'queued', round: 0, posts: [], createdAt: 1, updatedAt: 1 };
  store.task(parent); store.discussion(d); store.close(); store = new Store(file);
  const room = new Teamroom(store, 1, undefined, () => { throw new Error('Restart must never create a runner'); });
  assert.equal(store.discussions()[0].status, 'needs_decision'); assert.match(store.discussions()[0].posts[0].text, /不会自动重放/); assert.equal(store.tasks()[0].status, 'waiting_discussion'); room.close(); store.close();
});
test('cancelling a running consultation preserves replies and never starts the next consultant', async () => {
  let rejectRun: (reason: Error) => void = () => {}; let calls = 0;
  const { room, store } = live(() => ({ async run() { calls++; await new Promise<void>((_resolve, reject) => { rejectRun = reject; }); }, async cancel() { rejectRun(new Error('cancelled fixture')); }, close() { rejectRun(new Error('closed fixture')); } }));
  try {
    const id = randomUUID(); room.discuss({ id, question: '请核对实现', participants: ['codex', 'claude'] });
    await wait(() => store.discussions()[0]?.status === 'running' && calls === 1);
    await room.discussionCancel(id); await wait(() => store.discussions()[0].status === 'needs_decision');
    assert.equal(calls, 1); assert.match(store.discussions()[0].posts.at(-1)!.text, /本轮已取消/);
    room.discussionResolve(id, '本次不继续讨论', false); assert.equal(store.discussions()[0].status, 'resolved');
  } finally { room.close(); store.close(); }
});
test('confirming a conclusion without continuation never requeues the parent task', async () => {
  let calls = 0; const { room, store } = live(() => ({ async run(_t, _s, hooks) { calls++; hooks.text('<teamroom-discussion>{"question":"请老板确认","participants":[]}</teamroom-discussion>'); }, async cancel() {}, close() {} }));
  try {
    room.send({ id: randomUUID(), text: '@Codex 检查前提' }); await wait(() => store.discussions()[0]?.status === 'needs_decision');
    room.discussionResolve(store.discussions()[0].id, '先保留现状', false);
    await new Promise(r => setTimeout(r, 20)); assert.equal(calls, 1); assert.equal(store.tasks().find(t => t.source === 'live')!.status, 'interrupted');
  } finally { room.close(); store.close(); }
});
test('discussion of an existing delivery preserves acceptance when boss only confirms a conclusion', async () => {
  const store = new Store(':memory:'); const room = new Teamroom(store, 1);
  try {
    const parent = store.tasks()[0]; assert.equal(parent.status, 'awaiting_review');
    room.discuss({ id: randomUUID(), taskId: parent.id, question: '核对交付方案', participants: ['codex'] });
    await wait(() => store.discussions()[0]?.status === 'needs_decision');
    room.discussionResolve(store.discussions()[0].id, '保留当前交付，后续验收', false);
    assert.equal(store.tasks()[0].status, 'awaiting_review'); room.accept(parent.id); assert.equal(store.tasks()[0].status, 'accepted');
    assert.equal(store.events('demo').filter(e => e.status === 'awaiting_review').length, 1);
  } finally { room.close(); store.close(); }
});
test('cancel survives a mode switch and a late duplicate cancellation cannot undo a decision', async () => {
  let rejectRun: (reason: Error) => void = () => {}; const cancellations: (() => void)[] = [];
  const { room, store } = live(() => ({ async run() { await new Promise<void>((_resolve, reject) => { rejectRun = reject; }); }, async cancel() { await new Promise<void>(resolve => cancellations.push(() => { rejectRun(new Error('cancelled')); resolve(); })); }, close() { rejectRun(new Error('closed')); } }));
  try {
    const id = randomUUID(); room.discuss({ id, question: '核对取消边界', participants: ['codex'] });
    await wait(() => store.discussions()[0]?.status === 'running');
    const first = room.discussionCancel(id), second = room.discussionCancel(id);
    room.settings({ mode: 'demo', workspace: '', writable: false }); cancellations[0](); await first;
    assert.equal(store.discussions()[0].status, 'needs_decision');
    room.settings({ mode: 'live', workspace: process.cwd(), writable: false }); room.discussionResolve(id, '不再继续讨论', false);
    cancellations[1](); await second; assert.equal(store.discussions()[0].status, 'resolved'); assert.equal(store.discussions()[0].decision, '不再继续讨论');
  } finally { room.close(); store.close(); }
});
test('synchronous task send and discussion start share a single execution slot', async () => {
  let active = 0, peak = 0;
  const { room, store } = live(() => ({ async run(_t, _s, hooks) { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 15)); hooks.text('fixture complete'); active--; }, async cancel() {}, close() {} }));
  try {
    room.send({ id: randomUUID(), text: '@Codex 检查串行执行' });
    room.discuss({ id: randomUUID(), question: '核对执行顺序', participants: ['codex'] });
    await wait(() => store.discussions()[0]?.status === 'needs_decision' && store.tasks().some(t => t.source === 'live' && t.status === 'awaiting_review'));
    assert.equal(peak, 1); assert.equal(active, 0);
  } finally { room.close(); store.close(); }
});
test('late duplicate cancellation cannot cancel an explicitly queued next round', async () => {
  let rejectRun: (reason: Error) => void = () => {}; const cancellations: (() => void)[] = [];
  const { room, store } = live(() => ({ async run() { await new Promise<void>((_resolve, reject) => { rejectRun = reject; }); }, async cancel() { await new Promise<void>(resolve => cancellations.push(resolve)); }, close() { rejectRun(new Error('closed')); } }));
  try {
    const id = randomUUID(); room.discuss({ id, question: '确认取消的轮次', participants: ['codex'] }); await wait(() => store.discussions()[0]?.status === 'running');
    const first = room.discussionCancel(id), second = room.discussionCancel(id);
    cancellations[0](); await first; room.discussionRound(id); assert.equal(store.discussions()[0].status, 'queued');
    cancellations[1](); await second; assert.equal(store.discussions()[0].status, 'queued');
  } finally { room.close(); store.close(); }
});
