import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../core/store.js';
import { analytics } from '../core/analytics.js';
import { validateAccount } from '../core/accounts.js';
import { Teamroom } from '../core/service.js';
import { restoreStore, validatedBackup } from '../core/backup.js';
import type { Task, TaskEvent } from '../core/types.js';
const now = Date.parse('2026-10-18T01:00:00Z');
const t: Task = { id: 'task', messageId: 'message', agentId: 'codex', prompt: 'fixture', workspace: '/project', writable: false, status: 'accepted', source: 'live', createdAt: now - 12000, lastEventAt: now, result: '', category: '开发' };
test('analytics separates execution from waits and uses Beijing event dates for delivery and acceptance', () => {
  const rows: TaskEvent[] = ['queued', 'running', 'waiting_approval', 'running', 'waiting_discussion', 'running', 'awaiting_review', 'accepted'].map((status, index) => ({ sequence: index + 1, taskId: t.id, source: 'live', status: status as TaskEvent['status'], at: t.createdAt + index * 1000 }));
  const a = analytics([t], rows, 'live', now); assert.deepEqual(a.timings.task, { complete: true, queueMs: 1000, executionMs: 3000, approvalMs: 1000, discussionMs: 1000 }); assert.equal(a.efficiency[0].medianMs, 3000); assert.equal(a.today.find(r => r.agentId === 'codex')?.accepted, 1);
  const old = { ...t, createdAt: now - 86400000 };
  const crossed = analytics([old], [{ ...rows[6], at: now - 86400000 }, { ...rows[7], at: now }], 'live', now);
  assert.equal(crossed.today[1].delivered, 0); assert.equal(crossed.today[1].accepted, 1); assert.equal(crossed.timings.task.complete, false);
  assert.equal(analytics([t], [...rows, { ...rows[0], sequence: 20, status: 'interrupted' }], 'live', now).efficiency[0].samples, 0);
  assert.equal(analytics([{ ...t, category: undefined }], rows, 'live', now).efficiency[0].medianMs, null);
  assert.equal(analytics([t], rows, 'demo', now).efficiency.length, 0);
  assert.equal(analytics([{ ...t, status: 'running' }], [...rows, { ...rows[0], sequence: 20, at: now - 2000 }, { ...rows[1], sequence: 21, at: now - 1000 }], 'live', now).efficiency[0].samples, 0);
});
test('manual accounts distinguish unknown from zero and prevent duplicated tool ownership', () => {
  const value = { id: 'account-test', label: 'Personal', tools: ['codex', 'claude'] as const, state: 'unknown', currency: 'USD', source: 'provider', updatedAt: 0 } as any;
  assert.equal(validateAccount(value).balance, undefined); assert.equal(validateAccount({ ...value, balance: 0 }).balance, 0); assert.equal(validateAccount(value).source, 'manual');
  assert.throws(() => validateAccount({ ...value, balance: -1 })); assert.throws(() => validateAccount({ ...value, tools: ['invalid'] }));
  const store = new Store(':memory:'), room = new Teamroom(store); room.account(value); assert.equal(room.snapshot().accounts?.length, 1);
  assert.throws(() => room.account({ ...value, id: 'another-account' }), /已关联/); room.removeAccount(value.id); assert.equal(room.snapshot().accounts?.length, 0); room.close(); store.close();
});
test('online backup restores data, preserves rollback and disables execution', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'teamroom-backup-')), file = join(dir, 'current.db'), saved = join(dir, 'saved.db'); let store = new Store(file);
  try {
    store.saveSettings({ mode: 'live', workspace: process.cwd(), writable: true }); store.task({ ...t, status: 'running' }); await store.backup(saved); await assert.rejects(store.backup(saved), /已存在/);
    store.task({ ...t, id: 'new', status: 'accepted' }); const restored = await restoreStore(store, file, saved); store = restored.store;
    assert.ok(existsSync(restored.rollback)); assert.equal(store.tasks().length, 1); assert.equal(store.tasks()[0].status, 'interrupted'); assert.equal(store.settings().mode, 'demo'); assert.equal(store.settings().writable, false);
    const rollback = validatedBackup(restored.rollback); assert.equal((rollback.prepare('SELECT count(*) AS n FROM tasks').get() as any).n, 2); rollback.close();
    writeFileSync(join(dir, 'bad.db'), 'not a db'); await assert.rejects(restoreStore(store, file, join(dir, 'bad.db'))); assert.equal(store.tasks().length, 1);
    const db = new DatabaseSync(saved); db.exec('PRAGMA user_version=99'); db.close(); assert.throws(() => validatedBackup(saved), /校验失败/); assert.equal(store.settings().mode, 'demo');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('backup rejects poisoned schema, timestamps and triggers before replacing records; round zero is valid', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'teamroom-invalid-backup-')), file = join(dir,'valid.db'); const store = new Store(file);
  try {
    store.discussion({ id:'discussion', source:'demo', initiator:null, question:'fixture', participants:[], workspace:'', status:'needs_decision', round:0, posts:[], createdAt:1, updatedAt:1 });
    const zero = join(dir,'zero.db'); await store.backup(zero); validatedBackup(zero).close();
    for (const kind of ['timestamp','schema','trigger','order','identity','type']) {
      const bad = join(dir,kind+'.db'); await store.backup(bad); const db = new DatabaseSync(bad);
      if (kind === 'timestamp') db.prepare('INSERT INTO messages VALUES(?,?,?)').run('bad',JSON.stringify({id:'bad',source:'demo',role:'system',agentId:null,text:'fixture',at:1e308}),0);
      if (kind === 'schema') db.exec('DROP TABLE settings; CREATE TABLE settings(json TEXT)');
      if (kind === 'trigger') db.exec('CREATE TRIGGER corrupt AFTER INSERT ON settings BEGIN DELETE FROM tasks; END');
      if (kind === 'order') db.exec('DROP TABLE messages; CREATE TABLE messages(id TEXT PRIMARY KEY, at INTEGER NOT NULL, json TEXT NOT NULL)');
      if (kind === 'type') db.exec('DROP TABLE tasks; CREATE TABLE tasks(id INTEGER PRIMARY KEY, json TEXT NOT NULL, created_at INTEGER NOT NULL)');
      if (kind === 'identity') db.prepare('INSERT INTO messages VALUES(?,?,?)').run('bad',JSON.stringify({id:'bad',source:'demo',role:'agent',agentId:null,text:'fixture',at:1}),1);
      db.close(); assert.throws(()=>validatedBackup(bad),/校验失败/); assert.equal(store.discussions()[0].round,0);
    }
  } finally { store.close(); rmSync(dir,{recursive:true,force:true}); }
});
test('restoring rolls back normalization failures and legacy schemas migrate without losing records', async () => {
  const dir=mkdtempSync(join(tmpdir(),'teamroom-migration-')), file=join(dir,'current.db'), saved=join(dir,'saved.db');let store=new Store(file);
  const save=Store.prototype.saveSettings;
  try {
    store.saveSettings({mode:'live',workspace:process.cwd(),writable:true});store.task(t);await store.backup(saved);store.task({...t,id:'preserve-me'});
    Store.prototype.saveSettings=()=>{throw new Error('injected failure');};
    await assert.rejects(restoreStore(store,file,saved),/回滚/);Store.prototype.saveSettings=save;store=new Store(file);
    assert.equal(store.tasks().length,2);assert.equal(store.settings().mode,'live');assert.equal(store.settings().writable,true);
    const legacy=join(dir,'legacy.db'),db=new DatabaseSync(legacy);db.exec('CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL); CREATE TABLE messages (id TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL); CREATE TABLE tasks (id TEXT PRIMARY KEY, json TEXT NOT NULL, created_at INTEGER NOT NULL);');
    db.prepare('INSERT INTO messages VALUES(?,?,?)').run('legacy',JSON.stringify({id:'legacy',agentId:null,role:'system',source:'demo',text:'preserved',at:1}),1);db.close();
    const upgraded=new Store(legacy);assert.equal(upgraded.messages()[0].text,'preserved');assert.deepEqual(upgraded.events('demo'),[]);upgraded.close();
  } finally {Store.prototype.saveSettings=save;store.close();rmSync(dir,{recursive:true,force:true});}
});
