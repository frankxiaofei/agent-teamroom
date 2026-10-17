export type AgentId = 'claude' | 'codex' | 'opencode' | 'cursor' | 'cline' | 'workbuddy' | 'grok';
export type Mode = 'demo' | 'live';
export type TaskStatus = 'queued' | 'running' | 'waiting_approval' | 'awaiting_review' | 'accepted' | 'failed' | 'cancelled' | 'interrupted';
export interface Agent { id: AgentId; name: string; nick: string; job: string; avatar: number; }
export interface Settings { mode: Mode; workspace: string; writable: boolean; }
export interface Message { id: string; agentId: AgentId | null; role: 'user' | 'agent' | 'system'; text: string; at: number; source: Mode; taskId?: string; }
export interface Task { id: string; messageId: string; agentId: AgentId; prompt: string; workspace: string; writable: boolean; status: TaskStatus; createdAt: number; startedAt?: number; finishedAt?: number; lastEventAt: number; activity?: string; result: string; source: Mode; threadId?: string; }
export interface Approval { id: string; taskId: string; agentId: AgentId; kind: string; description: string; }
export interface Availability { agentId: AgentId; available: boolean; reason: string; }
export interface Quota { data: unknown; updatedAt: number; source: string; }
export interface Snapshot { settings: Settings; messages: Message[]; tasks: Task[]; approvals: Approval[]; availability: Availability[]; quota?: Quota; }
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
  subscribe(listener: (snapshot: Snapshot) => void): () => void;
}
