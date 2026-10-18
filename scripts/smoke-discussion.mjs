import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Store } from '../dist-main/core/store.js';
import { Teamroom } from '../dist-main/core/service.js';
if (!process.argv.includes('--inference')) {
  console.log('Skipped live inference. Use --inference to invoke two small read-only Codex consultations with your logged-in account.');
  process.exit(0);
}
const store = new Store(join(mkdtempSync(join(tmpdir(), 'teamroom-live-discussion-')), 'test.db'));
const room = new Teamroom(store);
const participants = process.argv.includes('--multi') ? ['codex','opencode'] : ['codex'];
try {
  room.settings({ mode: 'live', workspace: process.cwd(), writable: false });
  room.discuss({ id: crypto.randomUUID(), question: '这是一次只读协作烟测。请只用一句简短中文回答：讨论建议为什么不能等同于已经通过测试？不需要读取文件或执行命令。总结时也只用一句话。', participants });
  const deadline = Date.now() + 390000;
  while (store.discussions()[0]?.status !== 'needs_decision' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1000));
  const discussion = store.discussions()[0];
  assert.equal(discussion.status, 'needs_decision');
  assert.deepEqual(discussion.posts.map(p => p.kind), [...participants.map(()=>'reply'),'summary']);
  assert.ok(discussion.posts.every(p => p.text.trim().length > 0));
  assert.equal(store.tasks().filter(t => t.source === 'live').length, 0);
  assert.equal(store.settings().writable, false);
  room.discussionResolve(discussion.id, '烟测结束，不执行任何项目任务。', false);
  assert.equal(store.discussions()[0].status, 'resolved');
  console.log('Live '+participants.join(' + ')+' discussion passed: actual replies + summary, no execution task, read-only settings preserved, explicit boss conclusion.');
} finally { room.close(); store.close(); }
