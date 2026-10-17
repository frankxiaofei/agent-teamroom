import { AGENTS } from './agents.js';
import type { AgentId } from './types.js';
const names = AGENTS.map(a => a.name).sort((a, b) => b.length - a.length).join('|');
// Product-name boundaries stop @CodexExtra and email addresses from routing work.
const pattern = () => new RegExp(`(?<![A-Za-z0-9_])@(${names})(?=$|[\\s@，,。.!！?？;；、:：])`, 'gi');
export function parseMentions(text: string): { recipients: AgentId[]; prompt: string } {
  if (typeof text !== 'string' || !text.trim() || text.length > 8000) throw new Error('请输入 1–8000 字的群消息。');
  const recipients = [...new Set([...text.matchAll(pattern())].map(m => AGENTS.find(a => a.name.toLowerCase() === m[1].toLowerCase())!.id))];
  const prompt = text.replace(pattern(), '').trim();
  const unknown = prompt.match(/(^|[\s，,;；、])@([^\s@，,。.!！?？;；、:：]+)/);
  if (unknown) throw new Error(`无法识别 @${unknown[2]}，请从员工列表选择完整产品名。`);
  if (!recipients.length) throw new Error('请 @ 一位或多位 Agent，指定接收人。');
  if (!prompt || /^[\s，,。.!！?？;；、:：]+$/.test(prompt)) throw new Error('请补充要交代的工作或问题。');
  return { recipients, prompt };
}
export function mentionNames(text: string): AgentId[] {
  return [...new Set([...text.matchAll(pattern())].map(m => AGENTS.find(a => a.name.toLowerCase() === m[1].toLowerCase())!.id))];
}
export function executionPrompt(agentId: AgentId, groupMessage: string): string {
  const name = AGENTS.find(a => a.id === agentId)!.name;
  return `你是 Teamroom 工作群中的 ${name}。以下是老板的原始群消息。只处理交给你的部分；其他被 @ 的员工及其工作是上下文，不要代替他们执行。请向老板汇报真实进展、交付物和阻塞。\n\n${groupMessage}`;
}
