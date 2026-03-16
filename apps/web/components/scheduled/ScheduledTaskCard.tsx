/**
 * ScheduledTaskCard.tsx
 *
 * Displays a single scheduled (cron) task with toggle and delete actions.
 */

'use client';

import React, { useState } from 'react';
import { scheduled as scheduledApi, type ScheduledTask } from '../../lib/api-client';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  task: ScheduledTask;
  onDeleted: (id: string) => void;
  onUpdated: (task: ScheduledTask) => void;
}

export function ScheduledTaskCard({ task, onDeleted, onUpdated }: Props) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      const updated = await scheduledApi.toggle(task.id, !task.enabled);
      onUpdated(updated);
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${task.name}"?`)) return;
    setDeleting(true);
    try {
      await scheduledApi.delete(task.id);
      onDeleted(task.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className={`rounded-xl border p-4 transition ${
        task.enabled
          ? 'border-neutral-700 bg-neutral-800'
          : 'border-neutral-800 bg-neutral-900 opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-neutral-100">{task.name}</p>
            <span className="rounded bg-neutral-700 px-1.5 py-0.5 font-mono text-xs text-neutral-400">
              {task.cron}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 line-clamp-2">{task.task}</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-neutral-600">
            {task.last_run_at && (
              <span>
                Last run{' '}
                {formatDistanceToNow(new Date(task.last_run_at), { addSuffix: true })}
              </span>
            )}
            {task.next_run_at && task.enabled && (
              <span>
                Next run{' '}
                {formatDistanceToNow(new Date(task.next_run_at), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Toggle */}
          <button
            onClick={handleToggle}
            disabled={toggling}
            title={task.enabled ? 'Pause task' : 'Resume task'}
            className={`rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-40 ${
              task.enabled
                ? 'border-neutral-600 bg-neutral-700 text-neutral-300 hover:text-white'
                : 'border-green-700/50 bg-green-900/30 text-green-400 hover:bg-green-900/50'
            }`}
          >
            {toggling ? '…' : task.enabled ? 'Pause' : 'Resume'}
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-400 transition hover:border-red-500/60 hover:text-red-400 disabled:opacity-40"
          >
            {deleting ? '…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
