/**
 * NotificationsPanel.tsx
 *
 * Slide-in panel listing in-app notifications from the /notifications API.
 * Rendered as a right-side drawer triggered by the bell icon in the nav.
 *
 * Uses the useNotifications hook for data fetching, poll, and read state.
 */

'use client';

import React from 'react';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NotificationsPanel({ open, onClose }: Props) {
  const { items, loading, unreadCount, markRead, markAllRead } = useNotifications();

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-96 flex-col border-l border-neutral-700 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-neutral-100">Notifications</h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-neutral-400 transition hover:text-neutral-200"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="text-neutral-400 transition hover:text-neutral-200"
              aria-label="Close notifications"
            >
              ✕
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex h-32 items-center justify-center text-sm text-neutral-500">
              Loading…
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="flex h-32 flex-col items-center justify-center gap-1 text-sm text-neutral-500">
              <span className="text-2xl">🔔</span>
              No notifications yet
            </div>
          )}

          {!loading &&
            items.map((n) => (
              <div
                key={n.id}
                className={`border-b border-neutral-800 px-4 py-3 transition ${
                  !n.read ? 'bg-neutral-800/40' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-100">{n.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-400">{n.body}</p>
                    {n.url && (
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 text-xs text-blue-400 hover:underline"
                      >
                        Open →
                      </a>
                    )}
                    <p className="mt-1 text-xs text-neutral-600">
                      {formatDistanceToNow(new Date(n.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  {!n.read && (
                    <button
                      onClick={() => markRead(n.id)}
                      title="Mark as read"
                      className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500 transition hover:bg-blue-400"
                      aria-label="Mark as read"
                    />
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
