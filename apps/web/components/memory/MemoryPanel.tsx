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
  identity: 'bg-blue-900/40 text-blue-300',
  preferences: 'bg-purple-900/40 text-purple-300',
  projects: 'bg-green-900/40 text-green-300',
  history: 'bg-gray-700/40 text-gray-300',
  corrections: 'bg-orange-900/40 text-orange-300',
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
    <div className="w-80 border-l border-gray-800 bg-gray-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-200">Memory</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <p className="text-xs text-gray-500">Loading memories...</p>
        ) : memories.length === 0 ? (
          <p className="text-xs text-gray-500">No memories yet. As you chat, Infinius will learn about you.</p>
        ) : (
          memories.map(memory => (
            <div key={memory.id} className="group relative bg-gray-800 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full mb-1 ${CATEGORY_COLORS[memory.category]}`}>
                    {CATEGORY_LABELS[memory.category]}
                  </span>
                  <p className="text-xs text-gray-300 leading-relaxed">{memory.content}</p>
                </div>
                <button
                  onClick={() => deleteMemory(memory.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all flex-shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-800">
        <p className="text-xs text-gray-600">Memories are automatically extracted from conversations and used to personalise every response.</p>
      </div>
    </div>
  );
}
