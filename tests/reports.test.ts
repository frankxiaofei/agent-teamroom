import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../core/store.js';
import { DEFAULT_REPORTING, type Task } from '../core/types.js';
import { dailyCutoff, makeReport, scheduledReports, saveReporting, validateReporting } from '../core/reports.js';
const start = Date.parse('2026-10-17T09:00:00Z');
const task = (at = start): Task => ({ id: 'report-task', messageId: 'message', agentId: 'codex', prompt: '验证目录与报告', workspace: '', writable: false, status: 'running', source: 'demo', createdAt: at, startedAt: at, lastEventAt: at, result: '' });

test('status events are atomic, persistent and ignore token streaming', () => {
  const store = new Store(':memory:'); const t = task();
  store.task(t); store.task({ ...t, result: 'delta' });
  assert.equal(store.events('demo').length, 1);
  assert.throws(() => store.transaction(() => { store.task({ ...t, status: 'accepted' }); throw new Error('rollback'); }));
  assert.equal(store.events('demo').length, 1); assert.equal(store.tasks()[0].status, 'running');
  store.close();
});
test('30-minute reports stay quiet without changes and daily reports survive restart without duplicates', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'teamroom-reports-')), 'test.db'); let store = new Store(file);
  const t = task(); store.task(t);
  assert.deepEqual(scheduledReports(store, start), []);
  store.task({ ...t, status: 'awaiting_review', finishedAt: start + 60000, lastEventAt: start + 60000 });
  assert.deepEqual(scheduledReports(store, start + 29 * 60000), []);
  const progress = scheduledReports(store, start + 30 * 60000); assert.equal(progress.length, 1); assert.match(progress[0].text, /本期交付 1 项，验收 0 项/);
  assert.deepEqual(scheduledReports(store, start + 31 * 60000), []);
  const daily = scheduledReports(store, start + 60 * 60000); assert.equal(daily.length, 1); assert.equal(daily[0].kind, 'daily');
  store.close(); store = new Store(file);
  assert.deepEqual(scheduledReports(store, start + 60 * 60000), []);
  const catchup = scheduledReports(store, start + 3 * 86400000 + 60 * 60000); assert.equal(catchup.filter(r => r.kind === 'daily').length, 1);
  assert.deepEqual(scheduledReports(store, start + 3 * 86400000 + 61 * 60000), []); store.close();
});
test('cross-midnight acceptance is counted by event time and modes stay isolated', () => {
  const store = new Store(':memory:'); const t = task(start - 86400000);
  store.task({ ...t, status: 'awaiting_review' }); store.task({ ...t, status: 'accepted', lastEventAt: start });
  const report = makeReport(store, 'demo', 'daily', start - 1000, start + 1, store.events('demo').filter(e => e.at > start - 1000));
  assert.match(report.text, /本期交付 0 项，验收 1 项/);
  store.saveSettings({ mode: 'live', workspace: '', writable: false }); scheduledReports(store, start);
  const live = scheduledReports(store, start + 3600000); assert.equal(live.length, 1); assert.doesNotMatch(live[0].text, /Codex：/); store.close();
});
test('Beijing daily cutoff is stable on boundaries and preferences reject malformed IPC input', () => {
  assert.equal(dailyCutoff(start + 3600000, '18:00'), start + 3600000);
  assert.equal(dailyCutoff(start, '18:00'), start + 3600000 - 86400000);
  for (const value of [{ ...DEFAULT_REPORTING, dailyTime: '25:00' }, { ...DEFAULT_REPORTING, intervalMinutes: 0 }, { ...DEFAULT_REPORTING, enabled: 'yes' }]) assert.throws(() => validateReporting(value as typeof DEFAULT_REPORTING), /汇报设置无效/);
  const store = new Store(':memory:'); store.saveValue('reporting', { ...DEFAULT_REPORTING, enabled: false });
  assert.deepEqual(scheduledReports(store, start), []); store.close();
});
test('restart interruption is dated at observation, not the old activity timestamp', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'teamroom-restart-event-')), 'test.db'); let store = new Store(file);
  store.task(task(Date.now() - 3 * 86400000)); store.close();
  const before = Date.now(); store = new Store(file); const events = store.events('demo');
  assert.equal(events.at(-1)!.status, 'interrupted'); assert.ok(events.at(-1)!.at >= before);
  const report = makeReport(store, 'demo', 'manual', before - 1, Date.now(), events.filter(e => e.at >= before));
  assert.match(report.text, /失败\/中断 1 项/); store.close();
});
test('notification and interval settings preserve unreported work and discussion changes', () => {
  const store = new Store(':memory:'); const t = task(); store.task(t); scheduledReports(store, start);
  store.task({ ...t, status: 'awaiting_review', lastEventAt: start + 60000 });
  saveReporting(store, { ...DEFAULT_REPORTING, notifications: false }, start + 2 * 60000);
  const reports = scheduledReports(store, start + 30 * 60000); assert.equal(reports.length, 1); assert.match(reports[0].text, /本期交付 1 项/);
  store.task({ ...t, status: 'accepted', lastEventAt: start + 31 * 60000 });
  saveReporting(store, { ...DEFAULT_REPORTING, intervalMinutes: 10 }, start + 32 * 60000);
  const rescheduled = scheduledReports(store, start + 42 * 60000); assert.equal(rescheduled.length, 1); assert.match(rescheduled[0].text, /验收 1 项/); store.close();
});
