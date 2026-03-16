/**
 * api-client.ts
 *
 * Thin wrapper around the Infinius API.  All calls include the Supabase
 * JWT from localStorage so the API can identify the requesting user.
 *
 * Base URL is set via NEXT_PUBLIC_API_URL (defaults to localhost:3001 for
 * local development).
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  // Supabase stores the session under "sb-<project>-auth-token" but we
  // normalise to a single key set by our auth flow.
  return localStorage.getItem('infinius:token');
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export const sessions = {
  list: (): Promise<Session[]> => request('GET', '/sessions'),
  create: (title?: string): Promise<Session> =>
    request('POST', '/sessions', { title }),
  delete: (id: string): Promise<void> => request('DELETE', `/sessions/${id}`),
};

// ── Chat (SSE) ────────────────────────────────────────────────────────────────

export interface ChatStartOptions {
  sessionId: string;
  message: string;
  model?: string;
}

/**
 * Opens an EventSource-compatible SSE stream for a chat turn.
 * Returns the raw Response so callers can pipe it through a ReadableStream
 * reader and handle events incrementally.
 */
export async function startChat(opts: ChatStartOptions): Promise<Response> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...authHeaders(),
    },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    throw new Error(`Chat stream failed: ${res.status}`);
  }
  return res;
}

/**
 * Sends a mid-turn interrupt reply (used by ConfirmActionDialog and
 * AskUserQuestionDialog to resolve pending tool calls).
 */
export async function sendInterrupt(
  sessionId: string,
  payload: unknown,
): Promise<void> {
  await request('POST', `/chat/${sessionId}/interrupt`, payload);
}

// ── Memory ────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  content: string;
  created_at: string;
}

export const memory = {
  list: (): Promise<MemoryEntry[]> => request('GET', '/memory'),
  delete: (id: string): Promise<void> => request('DELETE', `/memory/${id}`),
  search: (q: string): Promise<MemoryEntry[]> =>
    request('GET', `/memory/search?q=${encodeURIComponent(q)}`),
};

// ── Connectors ────────────────────────────────────────────────────────────────

export interface Connector {
  id: string;
  name: string;
  description: string;
  status: 'connected' | 'disconnected' | 'quota_exhausted';
  icon_url?: string;
  auth_url?: string;
}

export const connectors = {
  list: (): Promise<Connector[]> => request('GET', '/connectors'),
  disconnect: (id: string): Promise<void> =>
    request('DELETE', `/connectors/${id}`),
};

// ── Notifications ─────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  url?: string;
  read: boolean;
  created_at: string;
}

export const notifications = {
  list: (): Promise<AppNotification[]> => request('GET', '/notifications'),
  markRead: (id: string): Promise<void> =>
    request('PATCH', `/notifications/${id}/read`, {}),
  markAllRead: (): Promise<void> =>
    request('POST', '/notifications/read-all', {}),
};

// ── Scheduled tasks (crons) ───────────────────────────────────────────────────

export interface ScheduledTask {
  id: string;
  name: string;
  cron: string;
  task: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export const scheduled = {
  list: (): Promise<ScheduledTask[]> => request('GET', '/cron'),
  toggle: (id: string, enabled: boolean): Promise<ScheduledTask> =>
    request('PATCH', `/cron/${id}`, { enabled }),
  delete: (id: string): Promise<void> => request('DELETE', `/cron/${id}`),
};

// ── Files ─────────────────────────────────────────────────────────────────────

export interface SharedFile {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  url: string;
  created_at: string;
}

export const files = {
  list: (sessionId: string): Promise<SharedFile[]> =>
    request('GET', `/sessions/${sessionId}/files`),
  download: (id: string): string => `${BASE}/files/${id}/download`,
};
