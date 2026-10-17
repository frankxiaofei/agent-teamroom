import { AGENTS } from './agents.js';
import type { AgentId } from './types.js';

const aliases: Record<string, AgentId> = { claude: 'claude', 'grok bot': 'grok', grok: 'grok' };
const tokens = [...new Set([...AGENTS.map(agent => agent.name), 'Grok Bot', 'Claude', 'all', '所有人', '全体'])].sort((a, b) => b.length - a.length);
const boundary = '(?=$|[\\s@，,。.!！?？;；、:：])';
const pattern = () => new RegExp(`(?<![A-Za-z0-9_])@(${tokens.join('|')})${boundary}`, 'gi');
const allTokens = new Set(['all', '所有人', '全体']);

function agentFor(token: string): AgentId | 'all' | undefined {
  if (allTokens.has(token.toLowerCase())) return 'all';
  return AGENTS.find(agent => agent.name.toLowerCase() === token.toLowerCase())?.id || aliases[token.toLowerCase()];
}
function scan(text: string) {
  const recipients: AgentId[] = [];
  let all = false;
  for (const match of text.matchAll(pattern())) {
    const agent = agentFor(match[1]);
    if (agent === 'all') all = true;
    else if (agent && !recipients.includes(agent)) recipients.push(agent);
  }
  return { recipients, all };
}
export function parseMentions(text: string): { recipients: AgentId[]; prompt: string; all: boolean } {
  if (typeof text !== 'string' || !text.trim() || text.length > 8000) throw new Error('请输入 1–8000 字的群消息。');
  const { recipients, all } = scan(text);
  const prompt = text.replace(pattern(), '').trim();
  const unknown = prompt.match(/(^|[\s，,;；、])@([^\s@，,。.!！?？;；、:：]+)/);
  if (unknown) throw new Error(`无法识别 @${unknown[2]}，请从员工列表选择完整产品名，或使用 @all。`);
  if (!recipients.length && !all) throw new Error('请 @ 一位或多位 Agent，指定接收人。');
  if (!prompt || /^[\s，,。.!！?？;；、:：]+$/.test(prompt)) throw new Error('请补充要交代的工作或问题。');
  return { recipients, prompt, all };
}
export function mentionNames(text: string): AgentId[] {
  return scan(text).recipients;
}
export function mentionsAll(text: string): boolean {
  return scan(text).all;
}
const typedMention = /(?<![A-Za-z0-9_])@([^\s@，,。.!！?？;；、:：]*)$/;
export function mentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const match = text.slice(0, caret).match(typedMention);
  return match ? { query: match[1], start: caret - match[0].length } : null;
}
export function completeAllMention(text: string, caret: number): { text: string; caret: number } | null {
  const active = mentionQuery(text, caret);
  if (!active || !allTokens.has(active.query.toLowerCase())) return null;
  const before = text.slice(0, active.start);
  const addition = (before && !/\s$/.test(before) ? ' ' : '') + '@all ';
  return { text: before + addition + text.slice(caret), caret: before.length + addition.length };
}
export function executionPrompt(agentId: AgentId, groupMessage: string): string {
  const name = AGENTS.find(agent => agent.id === agentId)!.name;
  return `你是 Teamroom 工作群中的 ${name}。以下是老板的原始群消息。只处理交给你的部分；其他被 @ 的员工及其工作是上下文，不要代替他们执行。请向老板汇报真实进展、交付物和阻塞。\n\n${groupMessage}`;
}
