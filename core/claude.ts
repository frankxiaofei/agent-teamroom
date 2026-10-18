import { query, type Options, type Query } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'node:crypto';
import type { RunEvents } from './codex.js';
import type { Settings, Task } from './types.js';
const readTools = ['Read', 'Grep', 'Glob'];
export function claudeOptions(task: Task, settings: Settings, events: RunEvents): Options {
  return {
    cwd: task.workspace, resume: task.threadId, settingSources: [], mcpServers: {},
    extraArgs: { restricted: null, 'strict-mcp-config': null },
    tools: settings.writable ? [...readTools, 'Edit', 'Write', 'Bash'] : readTools,
    permissionMode: 'default', includePartialMessages: true,
    hooks: { PreToolUse: [{ hooks: [async input => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: !settings.writable && !readTools.includes((input as { tool_name?: string }).tool_name || '') ? 'deny' : 'ask', permissionDecisionReason: 'Teamroom 逐次审批；只读任务禁止修改或执行命令。' } })] }] },
    canUseTool: async (tool, input) => {
      if (readTools.includes(tool)) return { behavior: 'allow', updatedInput: input };
      if (!settings.writable) return { behavior: 'deny', message: '当前任务只读，不允许执行此工具。' };
      const allowed = await new Promise<boolean>(resolve => events.approval(randomUUID(), tool, `${tool}\n${JSON.stringify(input).slice(0, 6000)}`, resolve));
      return allowed ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: '老板拒绝本次操作。' };
    },
  };
}
export class ClaudeRun {
  private session?: Query;
  private cancelled = false;
  constructor(private factory: typeof query = query) {}
  async run(task: Task, settings: Settings, events: RunEvents) {
    const session = this.session = this.factory({ prompt: task.prompt, options: claudeOptions(task, settings, events) });
    let text = '', completed = false;
    try {
      for await (const raw of session) {
        const m = raw as any;
        if (this.cancelled) throw new Error('任务已取消。');
        if (typeof m.session_id === 'string') events.thread(m.session_id);
        if (m.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.type === 'text_delta') { text += m.event.delta.text; events.text(text); }
        if (m.type === 'assistant') { const final = (m.message?.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n'); if (final) { text = final; events.text(text); } }
        if (m.type === 'result') {
          if (m.subtype !== 'success' || m.is_error) throw new Error((m.errors?.length ? m.errors.join('\n') : m.result) || 'Claude 本轮执行失败，请在外部终端检查登录和模型权限。');
          if (m.result) { text = m.result; events.text(text); }
          events.usage?.({ inputTokens: m.usage?.input_tokens || 0, outputTokens: m.usage?.output_tokens || 0, costUsd: m.total_cost_usd, cumulative: true, source: 'Claude Agent SDK result（提供方估算，非实际账单）', at: Date.now() });
          completed = true;
        }
      }
      if (!completed || !text.trim()) throw new Error('Claude 未确认完成或没有文本结果。');
    } finally { session.close(); }
  }
  async cancel() { this.cancelled = true; try { await this.session?.interrupt(); } finally { this.session?.close(); } }
  close() { this.cancelled = true; this.session?.close(); }
}
