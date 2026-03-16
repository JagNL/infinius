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
    <aside className="w-64 border-r border-gray-800 bg-gray-900 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center">
            <span className="text-xs font-bold text-white">∞</span>
          </div>
          <span className="font-semibold text-gray-100 text-sm">Infinius</span>
        </div>
        <button
          onClick={onNewSession}
          className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          + New session
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map(session => (
          <button
            key={session.id}
            onClick={() => onSessionSelect(session.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              session.id === currentSessionId
                ? 'bg-gray-700 text-gray-100'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
          >
            <div className="truncate">{session.title || 'Untitled session'}</div>
            <div className="text-xs text-gray-600 mt-0.5">
              {new Date(session.lastMessageAt).toLocaleDateString()}
            </div>
          </button>
        ))}

        {sessions.length === 0 && (
          <p className="text-xs text-gray-600 px-3 py-2">No sessions yet</p>
        )}
      </div>
    </aside>
  );
}
