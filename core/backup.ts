import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, statSync, renameSync, copyFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { AGENTS } from './agents.js';
import { Store, SCHEMA_VERSION } from './store.js';
import { validateBill } from './billing.js';
import { validateReporting } from './reports.js';
import { validateAccount } from './accounts.js';
const states = ['queued', 'running', 'waiting_approval', 'waiting_discussion', 'awaiting_review', 'accepted', 'failed', 'cancelled', 'interrupted'];
function check(value: unknown): asserts value { if (!value) throw new Error('备份格式或完整性校验失败，当前记录未替换。'); }
const amount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const timestamp = (v: unknown) => amount(v) && Number.isSafeInteger(v) && (v as number) <= 8640000000000000;
const agent = (id: unknown) => id === null || AGENTS.some(a => a.id === id);
export function validatedBackup(file: string) {
  check(statSync(file).isFile() && statSync(file).size <= 100 * 1024 * 1024);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    check(Object.values(db.prepare('PRAGMA integrity_check').get()!)[0] === 'ok');
    check(Number(Object.values(db.prepare('PRAGMA user_version').get()!)[0]) <= SCHEMA_VERSION);
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name));
    check(db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('trigger','view') OR upper(sql) LIKE '%CREATE VIRTUAL TABLE%' LIMIT 1").get() === undefined);
    check([...tables].every(name => ['messages', 'tasks', 'settings', 'reports', 'discussions', 'preferences', 'task_events', 'sqlite_sequence'].includes(name)));
    check(['messages', 'tasks', 'settings'].every(t => tables.has(t)));
    const columns: Record<string, string[]> = { settings: ['id','json'], messages: ['id','json','at'], tasks: ['id','json','created_at'], reports: ['id','json','at'], discussions: ['id','json','at'], preferences: ['key','json'], task_events: ['sequence','task_id','source','status','at'] };
    for (const [table, expected] of Object.entries(columns)) if (tables.has(table)) {
      const actual = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; pk: number; type: string }[];
      check(actual.length === expected.length && expected.every((name, i) => actual[i].name === name && actual[i].pk === (i === 0 ? 1 : 0) && actual[i].type.toUpperCase() === (['sequence','at','created_at'].includes(name) || (table === 'settings' && name === 'id') ? 'INTEGER' : 'TEXT')));
    }
    for (const table of ['messages', 'tasks', 'settings', 'reports', 'discussions']) {
      if (!tables.has(table)) continue;
      check(Number((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n) <= 100000);
      for (const row of db.prepare(`SELECT json FROM ${table}`).iterate() as Iterable<{ json: string }>) {
        check(typeof row.json === 'string' && row.json.length <= 2 * 1024 * 1024);
        const v = JSON.parse(row.json); check(v && typeof v === 'object' && !Array.isArray(v));
        if (table === 'settings') check(['demo', 'live'].includes(v.mode) && typeof v.workspace === 'string' && typeof v.writable === 'boolean');
        else {
          check(typeof v.id === 'string' && ['demo', 'live'].includes(v.source));
          if (table === 'messages') check(['user', 'agent', 'system'].includes(v.role) && typeof v.text === 'string' && timestamp(v.at) && (v.agentId === null || AGENTS.some(a => a.id === v.agentId)));
          if (table === 'messages' && v.role === 'agent') check(v.agentId !== null);
          if (table === 'tasks') check(AGENTS.some(a => a.id === v.agentId) && typeof v.prompt === 'string' && typeof v.workspace === 'string' && typeof v.result === 'string' && typeof v.writable === 'boolean' && states.includes(v.status) && timestamp(v.createdAt) && timestamp(v.lastEventAt) && (v.startedAt === undefined || timestamp(v.startedAt)) && (v.finishedAt === undefined || timestamp(v.finishedAt)));
          if (table === 'tasks') check(typeof v.messageId === 'string' && (v.category === undefined || ['未分类','开发','研究','审查','办公'].includes(v.category)) && (v.usage === undefined || (v.usage && typeof v.usage.source === 'string' && timestamp(v.usage.at) && amount(v.usage.inputTokens) && amount(v.usage.outputTokens) && (v.usage.costUsd === undefined || amount(v.usage.costUsd)))));
          if (table === 'reports') check(['progress','daily','manual','alert'].includes(v.kind) && typeof v.text === 'string' && Array.isArray(v.taskIds) && v.taskIds.every((id: unknown) => typeof id === 'string') && timestamp(v.from) && timestamp(v.to));
          if (table === 'discussions') check(typeof v.question === 'string' && typeof v.workspace === 'string' && agent(v.initiator) && Number.isInteger(v.round) && v.round >= 0 && v.round <= 3 && timestamp(v.createdAt) && timestamp(v.updatedAt) && (v.decision === undefined || typeof v.decision === 'string') && Array.isArray(v.posts) && v.posts.every((p: any) => p && typeof p.id === 'string' && typeof p.text === 'string' && agent(p.agentId) && timestamp(p.at) && Number.isInteger(p.round) && ['reply','summary','boss','error'].includes(p.kind)) && Array.isArray(v.participants) && v.participants.length <= 2 && v.participants.every((id: string) => id !== null && agent(id)) && ['queued', 'running', 'needs_decision', 'resolved'].includes(v.status));
        }
      }
    }
    if (tables.has('preferences')) for (const row of db.prepare('SELECT key,json FROM preferences').iterate() as Iterable<{ key: string; json: string }>) {
      check(typeof row.json === 'string' && row.json.length <= 2 * 1024 * 1024);
      const value = JSON.parse(row.json);
      if (row.key === 'reporting') validateReporting(value);
      else if (row.key === 'accounts') { check(Array.isArray(value)); value.forEach((a: any) => { validateAccount(a); check(a.source === 'manual' && timestamp(a.updatedAt)); }); const ids = value.flatMap((a: any) => a.tools); check(new Set(ids).size === ids.length); }
      else if (row.key === 'bills') {check(Array.isArray(value)&&value.length<=10000);value.forEach(validateBill);check(new Set(value.map((v:any)=>v.id)).size===value.length);}
      else if (/^report-origin:(demo|live)$/.test(row.key)) check(timestamp(value));
      else if (/^report-cursor:(demo|live)$/.test(row.key)) check(value && timestamp(value.nextCheck) && timestamp(value.from) && Number.isInteger(value.sequence) && value.sequence >= 0 && typeof value.discussions === 'string');
      else check(false);
    }
    if (tables.has('task_events')) for (const e of db.prepare('SELECT * FROM task_events').iterate() as Iterable<any>) check(Number.isInteger(e.sequence) && e.sequence > 0 && typeof e.task_id === 'string' && ['demo','live'].includes(e.source) && states.includes(e.status) && timestamp(e.at));
    return db;
  } catch { db.close(); throw new Error('备份格式或完整性校验失败，当前记录未替换。'); }
}
export async function restoreStore(current: Store, file: string, source: string): Promise<{ store: Store; rollback: string }> {
  const incoming = file + '.incoming-' + randomUUID(), rollback = file + '.before-restore-' + randomUUID() + '.db';
  const checked = validatedBackup(source);
  try { await backup(checked, incoming); } finally { checked.close(); }
  try {
    await current.backup(rollback); current.close(); renameSync(incoming, file);
    let store: Store | undefined;
    try {
      store = new Store(file);
      const settings = store.settings(); store.saveSettings({ ...settings, mode: 'demo', writable: false });
      // Restored authorizations belong to the old installation; never revive write access.
      for (const task of store.tasks()) if (task.writable) store.task({ ...task, writable: false, threadId: undefined });
      return { store, rollback };
    } catch { store?.close(); copyFileSync(rollback, file); throw new Error('恢复未完成，原数据库已回滚。请重新打开程序。'); }
  } finally { if (existsSync(incoming)) unlinkSync(incoming); }
}
