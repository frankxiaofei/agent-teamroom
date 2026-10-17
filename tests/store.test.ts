import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../core/store.js';
import type { Task } from '../core/types.js';
test('atomic rollback leaves no half-delivered group message', () => {
  const store = new Store(':memory:');
  assert.throws(() => store.transaction(() => { store.message({ id: 'rollback', role: 'user', agentId: null, text: 'hello', at: 1, source: 'demo' }); throw new Error('failure'); }));
  assert.equal(store.messages().length, 0); store.close();
});
test('restart recovers persisted tasks without dispatching them twice', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'teamroom-store-')), 'room.db');
  const task: Task = { id: 'task', messageId: 'message', agentId: 'codex', prompt: 'hello', source: 'live', workspace: tmpdir(), writable: false, status: 'running', createdAt: 1, startedAt: 2, lastEventAt: 2, result: '' };
  const first = new Store(file); first.task(task); first.saveSettings({ mode: 'live', workspace: tmpdir(), writable: false }); first.close();
  const second = new Store(file); assert.equal(second.tasks()[0].status, 'interrupted'); assert.equal(second.settings().mode, 'live'); second.close();
});
test('messages preserve ordering when timestamps match', () => {
  const store = new Store(':memory:'); for (const id of ['a','b','c']) store.message({ id, role: 'user', agentId: null, text: id, at: 1, source: 'demo' });
  assert.deepEqual(store.messages().map(m => m.id), ['a','b','c']); store.close();
});
test('queued tasks retain access to original messages outside the UI history window', () => {
  const store=new Store(':memory:');for(let i=0;i<510;i++)store.message({id:'m'+i,role:'user',agentId:null,text:'original-'+i,at:i,source:'demo'});
  assert.equal(store.messages().length,500);assert.equal(store.messageById('m0')?.text,'original-0');store.close();
});
