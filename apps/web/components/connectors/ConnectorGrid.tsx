/**
 * ConnectorGrid.tsx
 *
 * Fetches and displays all available connectors.
 * Groups them by status: Connected first, then available, then quota-exhausted.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { connectors as connectorsApi, type Connector } from '../../lib/api-client';
import { ConnectorCard } from './ConnectorCard';

export function ConnectorGrid() {
  const [items, setItems] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    connectorsApi
      .list()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleDisconnect(connector: Connector) {
    if (!confirm(`Disconnect ${connector.name}?`)) return;
    await connectorsApi.disconnect(connector.id);
    setItems((prev) =>
      prev.map((c) =>
        c.id === connector.id ? { ...c, status: 'disconnected' } : c,
      ),
    );
  }

  const filtered = items.filter(
    (c) =>
      !query ||
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.description.toLowerCase().includes(query.toLowerCase()),
  );

  const connected = filtered.filter((c) => c.status === 'connected');
  const available = filtered.filter((c) => c.status === 'disconnected');
  const exhausted = filtered.filter((c) => c.status === 'quota_exhausted');

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
        Loading connectors…
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

  return (
    <div className="space-y-6">
      {/* Search */}
      <input
        type="search"
        placeholder="Search connectors…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-blue-500"
      />

      {/* Connected */}
      {connected.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Connected ({connected.length})
          </h3>
          <div className="space-y-2">
            {connected.map((c) => (
              <ConnectorCard
                key={c.id}
                connector={c}
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        </section>
      )}

      {/* Available */}
      {available.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Available ({available.length})
          </h3>
          <div className="space-y-2">
            {available.map((c) => (
              <ConnectorCard key={c.id} connector={c} />
            ))}
          </div>
        </section>
      )}

      {/* Quota exhausted */}
      {exhausted.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-600/70">
            Quota exhausted ({exhausted.length})
          </h3>
          <div className="space-y-2">
            {exhausted.map((c) => (
              <ConnectorCard key={c.id} connector={c} />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <p className="text-center text-sm text-neutral-500">
          No connectors match &ldquo;{query}&rdquo;
        </p>
      )}
    </div>
  );
}
