import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executionPrompt, parseMentions, mentionNames } from '../core/mentions.js';
test('routes a spaced product name and deduplicates recipients', () => {
  assert.deepEqual(parseMentions('@Claude Code @Codex @codex 检查登录模块'), { recipients: ['claude', 'codex'], prompt: '检查登录模块' });
});
test('does not route email addresses or a longer product-like name', () => {
  assert.deepEqual(mentionNames('hello@Codex and @CodexExtra'), []);
  assert.throws(() => parseMentions('@CodexExtra 检查'), /无法识别/);
});
test('accepts Chinese mention adjacency and punctuation', () => { assert.deepEqual(parseMentions('请@Codex：检查登录').recipients, ['codex']); });
test('requires explicit recipient, body and bounded input', () => {
  assert.throws(() => parseMentions('检查登录'), /指定接收人/);
  assert.throws(() => parseMentions('@Codex，'), /补充/);
  assert.throws(() => parseMentions('@Codex @Unknown 检查'), /无法识别/);
  assert.throws(() => parseMentions('@Codex ' + 'x'.repeat(8000)), /8000/);
});
test('preserves shell metacharacters as prompt text', () => { assert.equal(parseMentions('@Codex echo `secret`; $(whoami)').prompt, 'echo `secret`; $(whoami)'); });
test('execution retains original recipient assignments instead of merging their work', () => {
  const original='@Codex 负责修复，@Claude Code 负责审查';
  const prompt=executionPrompt('codex',original);
  assert.ok(prompt.endsWith(original));assert.match(prompt,/只处理交给你的部分/);assert.match(prompt,/工作群中的 Codex/);
});
