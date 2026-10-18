import { AGENTS } from './agents.js';
import type { AgentId } from './types.js';
export interface Account { id: string; label: string; tools: AgentId[]; state: 'unknown' | 'active' | 'low' | 'past_due'; balance?: number; currency: 'USD' | 'CNY'; source: 'manual'; updatedAt: number; }
export function validateAccount(input: Account): Account {
  if (!input || typeof input.id !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(input.id) || typeof input.label !== 'string' || !input.label.trim() || input.label.length > 80 || !Array.isArray(input.tools) || !input.tools.length || input.tools.some(id => !AGENTS.some(a => a.id === id)) || !['unknown', 'active', 'low', 'past_due'].includes(input.state) || !['USD', 'CNY'].includes(input.currency) || (input.balance !== undefined && (!Number.isFinite(input.balance) || input.balance < 0))) throw new Error('账户登记格式无效。余额必须为非负数字，未知请留空。');
  return { id: input.id, label: input.label.trim(), tools: [...new Set(input.tools)], state: input.state, balance: input.balance, currency: input.currency, source: 'manual', updatedAt: Date.now() };
}
