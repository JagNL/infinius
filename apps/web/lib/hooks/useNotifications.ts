/**
 * useNotifications.ts
 *
 * Polls the /notifications endpoint every 30 seconds and exposes helpers to
 * mark notifications as read.  In production you'd replace the poll with a
 * Supabase Realtime subscription on the `notifications` table.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  notifications as notificationsApi,
  type AppNotification,
} from '../api-client';

const POLL_INTERVAL_MS = 30_000;

export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const list = await notificationsApi.list();
      setItems(list);
    } catch {
      // Swallow fetch errors in the background poll — UI should not break
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications]);

  const markRead = useCallback(async (id: string) => {
    await notificationsApi.markRead(id);
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const unreadCount = items.filter((n) => !n.read).length;

  return { items, loading, unreadCount, markRead, markAllRead, refetch: fetchNotifications };
}
