/**
 * /settings/memory — Browse, search, and delete memory entries.
 */

'use client';

import React from 'react';
import { SettingsNav } from '../../../components/layout/SettingsNav';
import { useMemory } from '../../../lib/hooks/useMemory';
import { formatDistanceToNow } from 'date-fns';

export default function MemoryPage() {
  const { entries, loading, error, query, searching, search, deleteEntry } =
    useMemory();

  return (
    <div className="flex min-h-screen bg-neutral-950">
      <aside className="w-64 border-r border-neutral-800 p-6">
        <SettingsNav />
      </aside>
      <main className="flex-1 p-8">
        <div className="mx-auto max-w-2xl">
          <header className="mb-6">
            <h1 className="text-xl font-semibold text-neutral-100">Memory</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Facts the agent has stored about you across conversations.
              Delete any entry to remove it permanently.
            </p>
          </header>

          {/* Search */}
          <div className="mb-4 flex items-center gap-3">
            <input
              type="search"
              placeholder="Search memories…"
              value={query}
              onChange={(e) => search(e.target.value)}
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-blue-500"
            />
            {searching && (
              <span className="text-xs text-neutral-500">Searching…</span>
            )}
          </div>

          {/* States */}
          {loading && (
            <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
              Loading…
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-neutral-500">
              <span className="text-4xl">🧠</span>
              <p className="text-sm">
                {query ? 'No memories match your search.' : 'No memories stored yet.'}
              </p>
            </div>
          )}

          {/* List */}
          {!loading && entries.length > 0 && (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="group flex items-start justify-between gap-3 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3"
                >
                  <div className="flex-1">
                    <p className="text-sm text-neutral-100">{entry.content}</p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {formatDistanceToNow(new Date(entry.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    title="Delete memory"
                    className="mt-0.5 text-neutral-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                    aria-label="Delete"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
