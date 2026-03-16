/**
 * ConfirmActionDialog.tsx
 *
 * Rendered when the agent emits a `confirm_action` SSE event.  The agent
 * loop is suspended server-side (via a Redis pub/sub gate) until the user
 * approves or denies.  On resolution we POST to /chat/:sessionId/interrupt
 * with { type: 'confirm_action', approved: boolean }.
 *
 * SSE event shape:
 *   { type: 'confirm_action', id: string, action: string, question: string, placeholder?: string }
 */

'use client';

import React, { useState } from 'react';
import { sendInterrupt } from '../../lib/api-client';

export interface ConfirmActionPayload {
  id: string;
  action: string;
  question: string;
  placeholder?: string;
}

interface Props {
  sessionId: string;
  payload: ConfirmActionPayload;
  onResolved: () => void;
}

export function ConfirmActionDialog({ sessionId, payload, onResolved }: Props) {
  const [loading, setLoading] = useState<'approve' | 'deny' | null>(null);

  async function respond(approved: boolean) {
    setLoading(approved ? 'approve' : 'deny');
    try {
      await sendInterrupt(sessionId, {
        type: 'confirm_action',
        id: payload.id,
        approved,
      });
    } finally {
      setLoading(null);
      onResolved();
    }
  }

  return (
    <div className="my-3 rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
          Action required
        </span>
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
          {payload.action}
        </span>
      </div>

      {/* Question */}
      <p className="mb-3 text-neutral-100">{payload.question}</p>

      {/* Draft preview (if any) */}
      {payload.placeholder && (
        <pre className="mb-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-neutral-800 p-3 text-xs text-neutral-300">
          {payload.placeholder}
        </pre>
      )}

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => respond(true)}
          disabled={loading !== null}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {loading === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button
          onClick={() => respond(false)}
          disabled={loading !== null}
          className="flex-1 rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-2 font-medium text-neutral-200 transition hover:bg-neutral-700 disabled:opacity-50"
        >
          {loading === 'deny' ? 'Denying…' : 'Deny'}
        </button>
      </div>
    </div>
  );
}
