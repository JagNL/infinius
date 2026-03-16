/**
 * ConnectorCard.tsx
 *
 * Displays a single connector with its status and a connect/disconnect action.
 *
 * Status colours:
 *   connected         → green dot
 *   disconnected      → grey dot, shows "Connect" button
 *   quota_exhausted   → amber dot, shows informational text
 */

'use client';

import React from 'react';
import type { Connector } from '../../lib/api-client';

interface Props {
  connector: Connector;
  onConnect?: (connector: Connector) => void;
  onDisconnect?: (connector: Connector) => void;
}

const STATUS_DOT: Record<Connector['status'], string> = {
  connected: 'bg-green-400',
  disconnected: 'bg-neutral-600',
  quota_exhausted: 'bg-amber-400',
};

const STATUS_LABEL: Record<Connector['status'], string> = {
  connected: 'Connected',
  disconnected: 'Not connected',
  quota_exhausted: 'Quota exhausted',
};

export function ConnectorCard({ connector, onConnect, onDisconnect }: Props) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-neutral-700 bg-neutral-800 p-4">
      {/* Left: icon + name */}
      <div className="flex items-center gap-3">
        {connector.icon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={connector.icon_url}
            alt={connector.name}
            className="h-9 w-9 rounded-lg object-contain"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-700 text-lg">
            🔌
          </div>
        )}
        <div>
          <p className="font-medium text-neutral-100">{connector.name}</p>
          <p className="text-xs text-neutral-500">{connector.description}</p>
        </div>
      </div>

      {/* Right: status + action */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${STATUS_DOT[connector.status]}`}
            aria-hidden
          />
          <span className="text-xs text-neutral-400">
            {STATUS_LABEL[connector.status]}
          </span>
        </div>

        {connector.status === 'connected' && (
          <button
            onClick={() => onDisconnect?.(connector)}
            className="rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-red-500/60 hover:text-red-400"
          >
            Disconnect
          </button>
        )}

        {connector.status === 'disconnected' && (
          <a
            href={connector.auth_url ?? '#'}
            onClick={(e) => {
              if (!connector.auth_url) {
                e.preventDefault();
                onConnect?.(connector);
              }
            }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
            target="_blank"
            rel="noopener noreferrer"
          >
            Connect
          </a>
        )}

        {connector.status === 'quota_exhausted' && (
          <span className="text-xs text-amber-400">Monthly quota used</span>
        )}
      </div>
    </div>
  );
}
