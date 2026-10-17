import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../core/store.js';
import { Teamroom } from '../core/service.js';
const wait = async (fn: () => boolean) => { for (let i=0;i<100;i++) { if(fn()) return; await new Promise(r=>setTimeout(r,10)); } throw new Error('Timed out waiting for task'); };
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
