'use client';

import { useEffect, useState } from 'react';
import type { Memory } from '../../lib/types';

const CATEGORY_LABELS: Record<string, string> = {
  identity: 'Identity',
  preferences: 'Preferences',
  projects: 'Projects',
  history: 'History',
  corrections: 'Corrections',
};

const CATEGORY_COLORS: Record<string, string> = {
  identity: 'bg-violet-900/40 text-violet-300 border border-violet-700/30',
  preferences: 'bg-neutral-800 text-neutral-300 border border-neutral-700/50',
  projects: 'bg-neutral-800 text-neutral-300 border border-neutral-700/50',
  history: 'bg-neutral-800 text-neutral-500 border border-neutral-700/30',
  corrections: 'bg-neutral-800 text-neutral-400 border border-neutral-700/40',
};

interface MemoryPanelProps {
  onClose: () => void;
}

export function MemoryPanel({ onClose }: MemoryPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/memory`)
      .then(r => r.json())
      .then(data => { setMemories(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const deleteMemory = async (id: string) => {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/memory/${id}`, { method: 'DELETE' });
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="w-72 border-l border-neutral-800 bg-neutral-900 flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          {/* Brain / memory icon */}
          <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <h2 className="text-sm font-medium text-neutral-100">Memory</h2>
        </div>
        <button
          onClick={onClose}
          className="text-neutral-600 hover:text-neutral-300 transition-colors"
          aria-label="Close memory panel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Memory list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {loading ? (
          <div className="flex items-center gap-2 px-1 py-3">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 animate-bounce [animation-delay:300ms]" />
            </div>
            <span className="text-xs text-neutral-600">Loading memories</span>
          </div>
        ) : memories.length === 0 ? (
          <div className="px-1 py-4 text-center">
            <svg className="w-8 h-8 text-neutral-700 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            <p className="text-xs text-neutral-600 leading-relaxed">
              No memories yet. As you chat, Infinius will learn about you.
            </p>
          </div>
        ) : (
          memories.map(memory => (
            <div
              key={memory.id}
              className="group relative bg-neutral-800/60 border border-neutral-700/40 rounded-lg p-3 hover:border-neutral-600/60 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mb-1.5 ${CATEGORY_COLORS[memory.category] ?? 'bg-neutral-800 text-neutral-400 border border-neutral-700/40'}`}>
                    {CATEGORY_LABELS[memory.category] ?? memory.category}
                  </span>
                  <p className="text-xs text-neutral-300 leading-relaxed">{memory.content}</p>
                </div>
                <button
                  onClick={() => deleteMemory(memory.id)}
                  className="opacity-0 group-hover:opacity-100 text-neutral-700 hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
                  aria-label="Delete memory"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-neutral-800">
        <p className="text-[11px] text-neutral-600 leading-relaxed">
          Memories are automatically extracted from conversations and used to personalise every response.
        </p>
      </div>
    </div>
  );
}
