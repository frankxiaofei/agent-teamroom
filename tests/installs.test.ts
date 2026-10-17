import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectInstalls } from '../core/installs.js';
test('distinguishes a runnable CLI, an editor command and a missing tool', () => {
  const found = new Set(['codex', 'cursor', 'grok']);
  const installs = detectInstalls(name => found.has(name));
  assert.equal(installs.find(item => item.agentId === 'codex')?.executable, true);
  assert.equal(installs.find(item => item.agentId === 'grok')?.executable, true);
  assert.equal(installs.find(item => item.agentId === 'cursor')?.installed, false);
  assert.match(installs.find(item => item.agentId === 'cursor')!.detail, /cursor/);
  assert.match(installs.find(item => item.agentId === 'opencode')!.detail, /未检测到 opencode/);
});
