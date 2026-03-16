/**
 * /settings/scheduled — View and manage scheduled (cron) tasks.
 */

import React from 'react';
import { SettingsNav } from '../../../components/layout/SettingsNav';
import { ScheduledTaskList } from '../../../components/scheduled/ScheduledTaskList';

export const metadata = { title: 'Scheduled Tasks — Infinius' };

export default function ScheduledPage() {
  return (
    <div className="flex min-h-screen bg-neutral-950">
      <aside className="w-64 border-r border-neutral-800 p-6">
        <SettingsNav />
      </aside>
      <main className="flex-1 p-8">
        <div className="mx-auto max-w-2xl">
          <header className="mb-6">
            <h1 className="text-xl font-semibold text-neutral-100">Scheduled Tasks</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Recurring tasks the agent runs automatically.
              Pause or delete tasks you no longer need.
            </p>
          </header>
          <ScheduledTaskList />
        </div>
      </main>
    </div>
  );
}
