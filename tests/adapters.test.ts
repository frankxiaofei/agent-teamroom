import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { AcpRun } from '../core/acp.js';
import { ClaudeRun, claudeOptions } from '../core/claude.js';
import { verifyOpenCodePolicy, openCodeEnvironment } from '../core/opencode.js';
import type { Task, Settings } from '../core/types.js';
import type { RunEvents } from '../core/codex.js';
const fixture = fileURLToPath(new URL('./fixtures/acp-server.mjs', import.meta.url));
const task: Task = { id: 'task', messageId: 'msg', agentId: 'opencode', prompt: 'hello', workspace: process.cwd(), writable: false, status: 'running', source: 'live', createdAt: 1, lastEventAt: 1, result: '' };
const settings: Settings = { mode: 'live', workspace: process.cwd(), writable: false };
const events = (values: Partial<RunEvents> = {}): RunEvents => ({ text: () => {}, activity: () => {}, thread: () => {}, approval: () => assert.fail('Unexpected privilege request'), ...values });
const runner = (mode = '') => new AcpRun({ file: process.execPath, args: [fixture, mode] }, 'Fixture');
test('ACP legacy and config-option modes enter read-only before sending prompts', async () => {
  for (const mode of ['', 'config']) { let text = ''; await runner(mode).run(task, settings, events({ text: value => { text = value; } })); assert.equal(text, 'readonly'); }
  await assert.rejects(runner('none').run(task, settings, events()), /未声明只读/);
});
test('ACP denies every read-only permission and selects only allow_once in writable mode', async () => {
  let text = '';
  await runner().run({ ...task, prompt: 'permission' }, settings, events({ text: v => { text = v; } })); assert.equal(JSON.parse(text).outcome, 'cancelled');
  await runner().run({ ...task, prompt: 'permission', writable: true }, { ...settings, writable: true }, events({ text: v => { text = v; }, approval: (_id, _kind, _description, answer) => { answer(true); answer(false); } })); assert.equal(JSON.parse(text).optionId, 'once');
});
test('ACP fails authoritative limits, broken resume, protocol mismatch and wrong Cursor identity', async () => {
  await assert.rejects(runner('limit').run(task, settings, events()), /max_tokens/);
  await assert.rejects(runner().run({ ...task, threadId: 'old' }, settings, events()), /Resume failed/);
  await assert.rejects(runner('version').run(task, settings, events()), /不兼容/);
  await assert.rejects(runner('null').run(task, settings, events()), /无效 ACP/);
  let auth = false;
  await assert.rejects(new AcpRun({ file: process.execPath, args: [fixture, 'imposter'] }, 'Cursor', async () => { auth = true; }).run(task, settings, events()), /未识别/); assert.equal(auth, false);
});
test('ACP cancellation terminates a waiting prompt', async () => {
  const run = runner(), pending = run.run({ ...task, prompt: 'wait' }, settings, events());
  const rejection = assert.rejects(pending, /取消/); await new Promise(r => setTimeout(r, 150)); await run.cancel(); await rejection;
});
test('ACP resumed history is never replayed as the new task result', async () => {
  let output = ''; await runner('replay').run({ ...task, threadId: 'previous' }, settings, events({ text: v => { output = v; } })); assert.equal(output, 'readonly');
  await assert.rejects(runner('replay-empty').run({ ...task, threadId: 'previous' }, settings, events()), /未返回/);
});
test('OpenCode writable sessions explicitly select the validated build mode', async () => {
  let text = ''; const run = new AcpRun({file:process.execPath,args:[fixture,'config']},'OpenCode',undefined,'build');
  await run.run({...task,writable:true},{...settings,writable:true},events({text:v=>{text=v;}})); assert.equal(text,'writable');
  await assert.rejects(new AcpRun({file:process.execPath,args:[fixture,'none']},'OpenCode',undefined,'build').run(task,{...settings,writable:true},events()),/未声明/);
});
test('Claude options restrict tools and every write requires a one-time boss answer', async () => {
  const opts = claudeOptions(task, settings, events()); assert.deepEqual(opts.tools, ['Read', 'Grep', 'Glob']); assert.deepEqual(opts.settingSources, []); assert.ok('restricted' in opts.extraArgs!);
  assert.equal((await opts.canUseTool!('Write', {}, {} as any)).behavior, 'deny');
  let asked = 0;
  const write = claudeOptions(task, { ...settings, writable: true }, events({ approval: (_id, _kind, _description, answer) => { asked++; answer(false); } }));
  assert.equal((await write.canUseTool!('Bash', { command: 'touch fixture' }, {} as any)).behavior, 'deny'); assert.equal(asked, 1);
  const hook = await (write.hooks!.PreToolUse![0].hooks[0] as any)({ tool_name: 'Bash' }); assert.equal(hook.hookSpecificOutput.permissionDecision, 'ask');
});
test('Claude streams, records estimated usage, and requires a successful final result', async () => {
  let closed = false, prompt = '', text = '', usage;
  const factory = ((input: any) => { prompt = input.prompt; return { async *[Symbol.asyncIterator]() { yield { type: 'assistant', session_id: 'claude-session', message: { content: [{ type: 'text', text: 'draft' }] } }; yield { type: 'result', subtype: 'success', result: 'final', total_cost_usd: 0.01, usage: { input_tokens: 3, output_tokens: 2 } }; }, close() { closed = true; } }; }) as any;
  await new ClaudeRun(factory).run(task, settings, events({ text: v => { text = v; }, usage: v => { usage = v; } })); assert.equal(prompt, 'hello'); assert.equal(text, 'final'); assert.ok(closed); assert.equal((usage as any).cumulative, true);
  const failed = (() => ({ async *[Symbol.asyncIterator]() { yield { type: 'result', subtype: 'error_max_turns', errors: ['turn limit'] }; }, close() {} })) as any;
  await assert.rejects(new ClaudeRun(failed).run(task, settings, events()), /turn limit/);
});
test('OpenCode isolates external configuration and rejects auto-allowed edits even when plan is advertised', () => {
  const env = openCodeEnvironment('/isolated', false); assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG,'true'); assert.equal(env.HOME,process.env.HOME); assert.equal(env.XDG_DATA_HOME,process.env.XDG_DATA_HOME); assert.equal(env.OPENCODE_CONFIG,undefined);
  const rules = [{permission:'*',pattern:'*',action:'deny'},{permission:'read',pattern:'*',action:'allow'}];
  verifyOpenCodePolicy({permission:rules},'/data/opencode',false);
  assert.throws(()=>verifyOpenCodePolicy({permission:[...rules,{permission:'edit',pattern:'*',action:'allow'}]},'/data/opencode',false),/实际权限/);
  assert.throws(()=>verifyOpenCodePolicy({permission:[...rules,{permission:'external_directory',pattern:'/private/*',action:'allow'}]},'/data/opencode',false),/实际权限/);
  assert.throws(()=>verifyOpenCodePolicy({permission:[{permission:'*',pattern:'*',action:'allow'}]},'/data/opencode',true),/实际权限/);
});
