/**
 * /settings/connectors — Manage OAuth integrations.
 *
 * Renders the ConnectorGrid inside the shared settings shell layout.
 */

import React from 'react';
import { SettingsNav } from '../../../components/layout/SettingsNav';
import { ConnectorGrid } from '../../../components/connectors/ConnectorGrid';

export const metadata = { title: 'Connectors — Infinius' };

export default function ConnectorsPage() {
  return (
    <div className="flex min-h-screen bg-neutral-950">
      <aside className="w-64 border-r border-neutral-800 p-6">
        <SettingsNav />
      </aside>
      <main className="flex-1 p-8">
        <div className="mx-auto max-w-2xl">
          <header className="mb-6">
            <h1 className="text-xl font-semibold text-neutral-100">Connectors</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Connect external services so the agent can read and act on your behalf.
              OAuth tokens are stored per-user and never shared.
            </p>
          </header>
          <ConnectorGrid />
        </div>
      </main>
    </div>
  );
}
