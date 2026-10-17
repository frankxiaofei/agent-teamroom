import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Message, Settings, Task } from './types.js';

export class Store {
  private db: DatabaseSync;
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, json TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_at ON messages(at);
      CREATE INDEX IF NOT EXISTS tasks_at ON tasks(created_at);`);
    for (const task of this.tasks()) {
      if (['queued', 'running', 'waiting_approval'].includes(task.status)) this.task({ ...task, status: 'interrupted', finishedAt: Date.now(), result: '应用重启，执行状态未恢复。请检查原工具后重新发送；不会自动重派。' });
    }
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
  task(value: Task) { this.db.prepare('INSERT INTO tasks VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(value.id, JSON.stringify(value), value.createdAt); }
  transaction(fn: () => void) {
    this.db.exec('BEGIN IMMEDIATE');
    try { fn(); this.db.exec('COMMIT'); } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
