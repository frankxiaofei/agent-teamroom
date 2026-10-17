export type AgentId = 'claude' | 'codex' | 'opencode' | 'cursor' | 'cline' | 'workbuddy' | 'grok';
export type Mode = 'demo' | 'live';
export type TaskStatus = 'queued' | 'running' | 'waiting_approval' | 'waiting_discussion' | 'awaiting_review' | 'accepted' | 'failed' | 'cancelled' | 'interrupted';
export interface Agent { id: AgentId; name: string; nick: string; job: string; avatar: number; }
export interface Settings { mode: Mode; workspace: string; writable: boolean; }
export interface Message { id: string; agentId: AgentId | null; role: 'user' | 'agent' | 'system'; text: string; at: number; source: Mode; taskId?: string; reportId?: string; discussionId?: string; }
export interface Task { id: string; messageId: string; agentId: AgentId; prompt: string; workspace: string; writable: boolean; status: TaskStatus; createdAt: number; startedAt?: number; finishedAt?: number; lastEventAt: number; activity?: string; result: string; source: Mode; threadId?: string; discussionContext?: string; }
export interface Approval { id: string; taskId: string; agentId: AgentId; kind: string; description: string; }
export interface Availability { agentId: AgentId; available: boolean; reason: string; }
export interface Quota { data: unknown; updatedAt: number; source: string; }
export interface Reporting { enabled: boolean; intervalMinutes: number; dailyTime: string; notifications: boolean; }
export const DEFAULT_REPORTING: Reporting = { enabled: true, intervalMinutes: 30, dailyTime: '18:00', notifications: true };
export interface TaskEvent { sequence: number; taskId: string; source: Mode; status: TaskStatus; at: number; }
export interface Report { id: string; source: Mode; kind: 'progress' | 'daily' | 'manual' | 'alert'; from: number; to: number; text: string; taskIds: string[]; }
export interface DiscussionPost { id: string; agentId: AgentId | null; text: string; at: number; round: number; kind: 'reply' | 'summary' | 'boss' | 'error'; }
export interface Discussion { id: string; source: Mode; taskId?: string; initiator: AgentId | null; question: string; participants: AgentId[]; workspace: string; status: 'queued' | 'running' | 'needs_decision' | 'resolved'; round: number; posts: DiscussionPost[]; createdAt: number; updatedAt: number; decision?: string; }
export interface DiscussionInput { id: string; question: string; participants: AgentId[]; taskId?: string; }
export interface Snapshot { settings: Settings; messages: Message[]; tasks: Task[]; approvals: Approval[]; availability: Availability[]; quota?: Quota; reporting: Reporting; reports: Report[]; discussions: Discussion[]; }
export interface SendInput { id: string; text: string; }
export interface Bridge {
  snapshot(): Promise<Snapshot>;
  send(input: SendInput): Promise<void>;
  settings(value: Settings): Promise<void>;
  chooseWorkspace(): Promise<string | null>;
  cancel(taskId: string): Promise<void>;
  accept(taskId: string): Promise<void>;
  approve(id: string, allow: boolean): Promise<void>;
  quota(): Promise<void>;
  reporting(value: Reporting): Promise<void>;
  report(): Promise<void>;
  discuss(input: DiscussionInput): Promise<void>;
  discussionReply(id: string, text: string): Promise<void>;
  discussionRound(id: string): Promise<void>;
  discussionResolve(id: string, decision: string, resume: boolean): Promise<void>;
  discussionCancel(id: string): Promise<void>;
  onFocus(listener: (target: { reportId?: string; discussionId?: string }) => void): () => void;
  subscribe(listener: (snapshot: Snapshot) => void): () => void;
}
