'use client';

import { useEffect, useState } from 'react';
import type { Session } from '../../lib/types';

interface SessionSidebarProps {
  currentSessionId: string;
  onSessionSelect: (id: string) => void;
  onNewSession: () => void;
}

export function SessionSidebar({ currentSessionId, onSessionSelect, onNewSession }: SessionSidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sessions`)
      .then(r => r.json())
      .then(setSessions)
      .catch(() => {});
  }, []);

  return (
    <aside className="w-56 bg-neutral-900 border-r border-neutral-800 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-5 h-5 rounded bg-violet-600 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-white">∞</span>
          </div>
          <span className="text-sm font-semibold text-neutral-100 tracking-tight">Infinius</span>
        </div>
        <button
          onClick={onNewSession}
          className="w-full py-1.5 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-xs font-medium transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New session
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {sessions.map(session => (
          <button
            key={session.id}
            onClick={() => onSessionSelect(session.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors group ${
              session.id === currentSessionId
                ? 'bg-neutral-700/80 text-neutral-100'
                : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
            }`}
          >
            <div className="truncate font-medium">{session.title || 'Untitled'}</div>
            <div className="text-neutral-600 mt-0.5 text-[11px]">
              {new Date(session.lastMessageAt).toLocaleDateString()}
            </div>
          </button>
        ))}

        {sessions.length === 0 && (
          <p className="text-[11px] text-neutral-600 px-3 py-2">No sessions yet</p>
        )}
      </div>
    </aside>
  );
}
