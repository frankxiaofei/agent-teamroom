import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Discussion, Message, Report, Settings, Task, TaskEvent, Mode } from './types.js';
export const SCHEMA_VERSION = 3;

export class Store {
  private db: DatabaseSync;
  closed = false;
  migrationBackup?: string;
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    try {
    const oldVersion=(this.db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version;
    if (oldVersion > SCHEMA_VERSION) throw new Error('数据库版本高于当前程序，请使用更新的 Teamroom。');
    if(file!==':memory:'&&oldVersion<SCHEMA_VERSION&&this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='settings'").get()) {
      this.migrationBackup=file+'.before-v'+SCHEMA_VERSION+'-'+randomUUID()+'.db';
      this.db.prepare('VACUUM INTO ?').run(this.migrationBackup);
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, json TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS discussions (id TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS task_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_at ON messages(at);
      CREATE INDEX IF NOT EXISTS tasks_at ON tasks(created_at);`);
    this.db.exec('PRAGMA user_version='+SCHEMA_VERSION);
    for (const task of this.tasks()) {
      if (['queued', 'running', 'waiting_approval'].includes(task.status)) { const now = Date.now(); this.task({ ...task, status: 'interrupted', finishedAt: now, lastEventAt: now, result: '应用重启，执行状态未恢复。请检查原工具后重新发送；不会自动重派。' }); }
    }
    for (const discussion of this.discussions()) {
      if (['queued', 'running'].includes(discussion.status)) this.discussion({ ...discussion, status: 'needs_decision', updatedAt: Date.now(), posts: [...discussion.posts, { id: crypto.randomUUID(), agentId: null, kind: 'error', round: discussion.round, at: Date.now(), text: '应用重启，讨论已暂停。请检查已有回复，明确继续下一轮或提交结论；不会自动重放。' }] });
    }
    } catch (error) { this.db.close(); this.closed = true; throw error; }
  }
  settings(): Settings {
    const row = this.db.prepare('SELECT json FROM settings WHERE id=1').get() as { json: string } | undefined;
    return row ? JSON.parse(row.json) as Settings : { mode: 'demo', workspace: '', writable: false };
  }
  saveSettings(value: Settings) { this.db.prepare('INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(value)); }
  messages(): Message[] { return (this.db.prepare('SELECT json FROM (SELECT json,at,rowid AS sequence FROM messages ORDER BY at DESC, rowid DESC LIMIT 500) ORDER BY at ASC, sequence ASC').all() as { json: string }[]).map(r => JSON.parse(r.json) as Message); }
  hasMessage(id: string): boolean { return Boolean(this.db.prepare('SELECT 1 FROM messages WHERE id=?').get(id)); }
  messageById(id: string): Message | undefined { const row = this.db.prepare('SELECT json FROM messages WHERE id=?').get(id) as { json: string } | undefined; return row ? JSON.parse(row.json) as Message : undefined; }
  message(value: Message) { this.db.prepare('INSERT INTO messages VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(value.id, JSON.stringify(value), value.at); }
  tasks(): Task[] { return (this.db.prepare('SELECT json FROM tasks ORDER BY created_at ASC, rowid ASC').all() as { json: string }[]).map(r => JSON.parse(r.json) as Task); }
  task(value: Task) {
    const previous = this.db.prepare('SELECT json FROM tasks WHERE id=?').get(value.id) as { json: string } | undefined;
    this.db.exec('SAVEPOINT task_change');
    try {
      this.db.prepare('INSERT INTO tasks VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(value.id, JSON.stringify(value), value.createdAt);
      if (!previous || (JSON.parse(previous.json) as Task).status !== value.status) this.db.prepare('INSERT INTO task_events(task_id,source,status,at) VALUES(?,?,?,?)').run(value.id, value.source, value.status, value.lastEventAt);
      this.db.exec('RELEASE task_change');
    } catch (error) { this.db.exec('ROLLBACK TO task_change; RELEASE task_change'); throw error; }
  }
  events(source: Mode, after = 0): TaskEvent[] { return this.db.prepare('SELECT sequence,task_id AS taskId,source,status,at FROM task_events WHERE source=? AND sequence>? ORDER BY sequence').all(source, after) as unknown as TaskEvent[]; }
  value<T>(key: string, fallback: T): T { const row = this.db.prepare('SELECT json FROM preferences WHERE key=?').get(key) as { json: string } | undefined; return row ? JSON.parse(row.json) as T : fallback; }
  saveValue(key: string, value: unknown) { this.db.prepare('INSERT INTO preferences VALUES(?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json').run(key, JSON.stringify(value)); }
  reports(): Report[] { return (this.db.prepare('SELECT json FROM reports ORDER BY at DESC LIMIT 200').all() as { json: string }[]).map(row => JSON.parse(row.json)); }
  hasReport(id: string): boolean { return Boolean(this.db.prepare('SELECT 1 FROM reports WHERE id=?').get(id)); }
  report(value: Report) { this.db.prepare('INSERT INTO reports VALUES(?,?,?)').run(value.id, JSON.stringify(value), value.to); }
  discussions(): Discussion[] { return (this.db.prepare('SELECT json FROM discussions ORDER BY at').all() as { json: string }[]).map(row => JSON.parse(row.json)); }
  discussion(value: Discussion) { this.db.prepare('INSERT INTO discussions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,at=excluded.at').run(value.id, JSON.stringify(value), value.createdAt); }
  transaction(fn: () => void) {
    this.db.exec('BEGIN IMMEDIATE');
    try { fn(); this.db.exec('COMMIT'); } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async backup(file: string) { if (existsSync(file)) throw new Error('备份文件已存在，请选择新文件名。'); await backup(this.db, file); }
  close() { if (this.closed) return; this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); this.db.close(); this.closed = true; }
}
