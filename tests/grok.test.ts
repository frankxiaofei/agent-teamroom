import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { GrokRun } from '../core/grok.js';
import type { Task } from '../core/types.js';
const fixture = fileURLToPath(new URL('./fixtures/grok-server.mjs', import.meta.url));
const command = { file: process.execPath, args: [fixture] };
const task: Task = { id: 'test', messageId: 'message', agentId: 'grok', prompt: 'hello', workspace: process.cwd(), writable: false, status: 'running', source: 'live', createdAt: 1, lastEventAt: 1, result: '' };
const hooks = (extra: Partial<{ text: (value: string) => void; approval: (id: string, kind: string, description: string, answer: (allow: boolean) => void) => void }> = {}) => ({ text: extra.text || (() => {}), activity: () => {}, thread: () => {}, approval: extra.approval || (() => {}) });
test('grok stdio streams text and keeps the prompt out of the process arguments', async () => {
  let text = '';
  await new GrokRun(command).run(task, { mode: 'live', workspace: process.cwd(), writable: false }, hooks({ text: value => { text = value; } }));
  assert.equal(text, 'fixture-grok');
  assert.equal(command.args.some(arg => arg.includes('hello')), false);
});
test('grok permission is explicit and unsupported requests are declined', async () => {
  let text = '', asked = false;
  await new GrokRun(command).run({ ...task, prompt: 'permission' }, { mode: 'live', workspace: process.cwd(), writable: false }, hooks({ text: value => { text = value; }, approval: (_id, _kind, description, answer) => { assert.match(description, /echo fixture/); asked = true; answer(false); } }));
  assert.equal(text, 'fixture-grok-declined');
  assert.ok(asked);
  await new GrokRun(command).run({ ...task, prompt: 'unsupported' }, { mode: 'live', workspace: process.cwd(), writable: false }, hooks({ text: value => { text = value; }, approval: () => assert.fail('unsupported') }));
  assert.match(text, /没有文本输出/);
});
test('grok reports a missing login instead of guessing credentials', async () => {
  await assert.rejects(new GrokRun({ file: process.execPath, args: [fixture, 'unsigned'] }).run(task, { mode: 'live', workspace: process.cwd(), writable: false }, hooks()), /grok login/);
});
test('cancelling grok stops the turn', async () => {
  const run = new GrokRun(command);
  const promise = run.run({ ...task, prompt: 'wait' }, { mode: 'live', workspace: process.cwd(), writable: false }, hooks());
  await new Promise(resolve => setTimeout(resolve, 100));
  await run.cancel();
  await assert.rejects(promise, /取消/);
});
