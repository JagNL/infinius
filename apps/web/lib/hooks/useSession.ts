/**
 * useSession.ts
 *
 * Manages the list of chat sessions and the currently-active session ID.
 * Fetches the session list on mount, exposes helpers to create / select /
 * delete sessions, and persists the last-active session ID in localStorage.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { sessions as sessionsApi, type Session } from '../api-client';

const LAST_SESSION_KEY = 'infinius:last-session';

export function useSession() {
  const [sessionList, setSessionList] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load sessions on mount
  useEffect(() => {
    (async () => {
      try {
        const list = await sessionsApi.list();
        setSessionList(list);

        // Restore last-used session or default to most recent
        const stored = localStorage.getItem(LAST_SESSION_KEY);
        const found = list.find((s) => s.id === stored);
        if (found) {
          setActiveSessionId(found.id);
        } else if (list.length > 0) {
          setActiveSessionId(list[0].id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load sessions');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Persist active session
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem(LAST_SESSION_KEY, activeSessionId);
    }
  }, [activeSessionId]);

  const selectSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  const createSession = useCallback(async (title?: string) => {
    const newSession = await sessionsApi.create(title);
    setSessionList((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    return newSession;
  }, []);

  const deleteSession = useCallback(
    async (id: string) => {
      await sessionsApi.delete(id);
      setSessionList((prev) => prev.filter((s) => s.id !== id));
      // If we deleted the active session, move to the next available one
      if (id === activeSessionId) {
        setSessionList((prev) => {
          const remaining = prev.filter((s) => s.id !== id);
          setActiveSessionId(remaining[0]?.id ?? null);
          return remaining;
        });
      }
    },
    [activeSessionId],
  );

  const updateSessionTitle = useCallback((id: string, title: string) => {
    setSessionList((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title } : s)),
    );
  }, []);

  return {
    sessionList,
    activeSessionId,
    loading,
    error,
    selectSession,
    createSession,
    deleteSession,
    updateSessionTitle,
  };
}
