import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../core/store.js';
import { Teamroom } from '../core/service.js';
const wait = async (fn: () => boolean) => { for (let i=0;i<100;i++) { if(fn()) return; await new Promise(r=>setTimeout(r,10)); } throw new Error('Timed out waiting for task'); };

test('invalid live directories fail before persistence with an actionable error', () => {
  const store = new Store(':memory:'); const room = new Teamroom(store);
  // Directory validation must work independently of whether Codex is installed.
  room.availability = () => [{ agentId: 'codex', available: true, reason: 'test fixture' }];
  const removed = mkdtempSync(join(tmpdir(), 'teamroom-removed-')); rmdirSync(removed);
  const file = join(tmpdir(), randomUUID() + '.txt'); writeFileSync(file, 'fixture');
  try {
    const before = room.snapshot();
    for (const workspace of ['', 'relative-folder', removed, file]) {
      store.saveSettings({ mode: 'live', workspace, writable: false });
      const id = randomUUID();
      assert.throws(() => room.send({ id, text: '@Codex 检查项目' }), workspace ? /工作目录不存在或无法访问.*重新选择/ : /请先选择工作目录/);
      assert.equal(store.hasMessage(id), false);
      assert.equal(room.snapshot().tasks.length, before.tasks.length);
    }
    assert.throws(() => room.settings({ mode: 'live', workspace: removed, writable: false }), /重新选择/);
    room.settings({ mode: 'live', workspace: process.cwd(), writable: false });
    assert.ok(room.snapshot().settings.workspace);
    assert.equal(room.snapshot().settings.writable, false);
  } finally { room.close(); store.close(); unlinkSync(file); }
});
test('fanout is explicit, idempotent and independently inspectable', async () => {
  const store = new Store(':memory:'); const room = new Teamroom(store, 10); const before = room.snapshot().tasks.length;
  const input = { id: randomUUID(), text: '@Codex @Claude Code 检查模块' };
  room.send(input); room.send(input);
  await wait(()=>room.snapshot().tasks.filter(t=>t.messageId===input.id).every(t=>t.status==='awaiting_review'));
  const tasks = room.snapshot().tasks.filter(t=>t.messageId===input.id);
  assert.equal(tasks.length,2); assert.equal(room.snapshot().tasks.length,before+2); assert.equal(tasks[0].source,'demo');
  room.accept(tasks[0].id); assert.equal(room.snapshot().tasks.find(t=>t.id===tasks[0].id)!.status,'accepted');
  room.close(); store.close();
});
test('@all reaches every available employee and still rejects an explicit unavailable mention', async () => {
  const store = new Store(':memory:'); const room = new Teamroom(store, 10);
  const id = randomUUID();
  room.send({ id, text: '@all 同步今天的进度' });
  await wait(() => room.snapshot().tasks.filter(t => t.messageId === id).every(t => t.status === 'awaiting_review'));
  const tasks = room.snapshot().tasks.filter(t => t.messageId === id);
  const available = room.availability().filter(item => item.available).map(item => item.agentId).sort();
  assert.deepEqual(tasks.map(t => t.agentId).sort(), available);
  assert.equal(tasks.some(t => t.agentId === 'workbuddy'), false);
  assert.ok(tasks.some(t => t.agentId === 'grok'));
  const before = room.snapshot();
  assert.throws(() => room.send({ id: randomUUID(), text: '@all @WorkBuddy 同步' }), /WorkBuddy/);
  assert.equal(room.snapshot().tasks.length, before.tasks.length);
  room.close(); store.close();
});
test('live availability follows installed commands and only enables agents with runners', () => {
  const store = new Store(':memory:'); const room = new Teamroom(store, 10, name => ['claude', 'cursor', 'grok'].includes(name));
  store.saveSettings({ mode: 'live', workspace: '', writable: false });
  const availability = room.availability();
  assert.equal(availability.find(item => item.agentId === 'claude')?.available, false);
  assert.match(availability.find(item => item.agentId === 'claude')!.reason, /已检测到 claude/);
  assert.match(availability.find(item => item.agentId === 'cursor')!.reason, /尚未发现可执行的 Agent 命令/);
  assert.equal(availability.find(item => item.agentId === 'grok')?.available, true);
  assert.equal(availability.find(item => item.agentId === 'codex')?.available, false);
  room.close(); store.close();
});
test('unavailable member blocks the entire send before persistence', () => {
  const store = new Store(':memory:'); const room = new Teamroom(store); const before=room.snapshot();
  assert.throws(()=>room.send({id:randomUUID(),text:'@Codex @WorkBuddy 检查模块'}),/WorkBuddy/);
  assert.equal(room.snapshot().tasks.length,before.tasks.length); assert.equal(room.snapshot().messages.length,before.messages.length); room.close();store.close();
});
test('queued and running demo jobs can be cancelled', async () => {
  const store = new Store(':memory:');const room=new Teamroom(store,200);const id=randomUUID();room.send({id,text:'@Codex @Cline 检查'});
  const tasks=room.snapshot().tasks.filter(t=>t.messageId===id);await room.cancel(tasks[1].id);await room.cancel(tasks[0].id);await new Promise(r=>setTimeout(r,20));
  assert.ok(room.snapshot().tasks.filter(t=>t.messageId===id).every(t=>t.status==='cancelled'));room.close();store.close();
});
