/**
 * ScheduledTaskList.tsx
 *
 * Fetches and renders the full list of scheduled tasks.
 * Used on /settings/scheduled.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { scheduled as scheduledApi, type ScheduledTask } from '../../lib/api-client';
import { ScheduledTaskCard } from './ScheduledTaskCard';

export function ScheduledTaskList() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    scheduledApi
      .list()
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleDeleted(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function handleUpdated(updated: ScheduledTask) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
        Loading scheduled tasks…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-neutral-500">
        <span className="text-4xl">⏰</span>
        <p className="text-sm">No scheduled tasks yet.</p>
        <p className="text-xs text-neutral-600">
          Use <code className="text-neutral-500">schedule_cron</code> in a chat to create one.
        </p>
      </div>
    );
  }

  const active = tasks.filter((t) => t.enabled);
  const paused = tasks.filter((t) => !t.enabled);

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Active ({active.length})
          </h3>
          <div className="space-y-2">
            {active.map((t) => (
              <ScheduledTaskCard
                key={t.id}
                task={t}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
              />
            ))}
          </div>
        </section>
      )}

      {paused.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Paused ({paused.length})
          </h3>
          <div className="space-y-2">
            {paused.map((t) => (
              <ScheduledTaskCard
                key={t.id}
                task={t}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
