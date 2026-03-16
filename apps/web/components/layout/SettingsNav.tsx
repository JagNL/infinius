/**
 * SettingsNav.tsx
 *
 * Left-side navigation for the /settings/* pages.
 * Highlights the active route.
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

const NAV_ITEMS = [
  { href: '/settings/connectors', label: 'Connectors', icon: '🔌' },
  { href: '/settings/memory', label: 'Memory', icon: '🧠' },
  { href: '/settings/scheduled', label: 'Scheduled Tasks', icon: '⏰' },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="w-56 flex-shrink-0">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        Settings
      </h2>
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? 'bg-neutral-800 text-neutral-100'
                    : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 border-t border-neutral-800 pt-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs text-neutral-500 transition hover:text-neutral-300"
        >
          ← Back to chat
        </Link>
      </div>
    </nav>
  );
}
