/**
 * TodoList.tsx
 *
 * Inline todo checklist that appears in the chat stream when the agent calls
 * update_todo_list or update_todo_status.  It animates task transitions and
 * always shows the current state (not a history of diffs).
 *
 * SSE event shapes:
 *
 *   update_todo_list:
 *   { type: 'todo_update', title: string, tasks: Array<{ description: string, status: 'pending'|'in_progress'|'completed' }> }
 *
 *   update_todo_status:
 *   { type: 'todo_status', updates: Array<{ index: number, status: string }> }
 *
 * The parent (MessageList) maintains the current task array in state and
 * passes it down here as `tasks`.
 */

'use client';

import React from 'react';

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoTask {
  description: string;
  status: TaskStatus;
}

interface Props {
  title: string;
  tasks: TodoTask[];
}

const STATUS_ICON: Record<TaskStatus, React.ReactNode> = {
  completed: (
    <span className="text-green-400" aria-label="completed">
      ✓
    </span>
  ),
  in_progress: (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
      aria-label="in progress"
    />
  ),
  pending: (
    <span className="text-neutral-500" aria-label="pending">
      ○
    </span>
  ),
};

const STATUS_TEXT: Record<TaskStatus, string> = {
  completed: 'text-neutral-400 line-through',
  in_progress: 'text-neutral-100',
  pending: 'text-neutral-500',
};

export function TodoList({ title, tasks }: Props) {
  if (!tasks.length) return null;

  const done = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="my-3 rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="font-semibold text-neutral-100">{title}</span>
        <span className="text-xs text-neutral-500">
          {done}/{tasks.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-neutral-700">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${(done / tasks.length) * 100}%` }}
        />
      </div>

      {/* Tasks */}
      <ul className="space-y-2">
        {tasks.map((task, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center">
              {STATUS_ICON[task.status]}
            </span>
            <span className={`leading-snug ${STATUS_TEXT[task.status]}`}>
              {task.description}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
