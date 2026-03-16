export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  isStreaming?: boolean;
}

export interface ToolActivity {
  id: string;
  toolName: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: unknown;
  output?: unknown;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
}

export interface Memory {
  id: string;
  category: 'identity' | 'preferences' | 'projects' | 'history' | 'corrections';
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Connector {
  sourceId: string;
  name: string;
  description: string;
  category: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'QUOTA_EXHAUSTED';
}
