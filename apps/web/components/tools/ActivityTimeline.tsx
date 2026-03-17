'use client';

import type { ToolActivity } from '../../lib/types';

interface ActivityTimelineProps {
  activities: ToolActivity[];
}

// Clean SVG icons for tool categories — no emoji
function ToolIcon({ toolName }: { toolName: string }) {
  if (toolName.includes('search') || toolName.includes('fetch') || toolName.includes('browse'))
    return <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round" strokeWidth={2}/></svg>;
  if (toolName.includes('bash') || toolName.includes('code') || toolName.includes('exec'))
    return <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3"/></svg>;
  if (toolName.includes('memory'))
    return <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>;
  if (toolName.includes('subagent') || toolName.includes('agent'))
    return <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>;
  if (toolName.includes('file') || toolName.includes('read') || toolName.includes('write'))
    return <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>;
  if (toolName.includes('cron') || toolName.includes('schedule') || toolName.includes('wait'))
    return <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7v5l3 3"/></svg>;
  if (toolName.includes('connector') || toolName.includes('external') || toolName.includes('tool'))
    return <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>;
  // default
  return <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path strokeLinecap="round" strokeWidth={2} d="M12 2v3m0 14v3M4.22 4.22l2.12 2.12m11.32 11.32l2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>;
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const recent = activities.slice(-8);

  return (
    <div className="max-w-3xl mx-auto px-4 pb-2 space-y-1">
      {recent.map(activity => (
        <div key={activity.id} className="flex items-center gap-2 py-0.5">
          {/* Status dot */}
          <div className={`flex items-center justify-center w-4 h-4 rounded shrink-0 ${
            activity.status === 'running'
              ? 'text-violet-400'
              : activity.status === 'completed'
              ? 'text-neutral-500'
              : 'text-red-500'
          }`}>
            <ToolIcon toolName={activity.toolName} />
          </div>

          <span className={`text-xs truncate ${
            activity.status === 'running'
              ? 'text-neutral-400'
              : 'text-neutral-600'
          }`}>
            {activity.description}
          </span>

          {activity.status === 'running' && (
            <div className="flex gap-0.5 shrink-0">
              <span className="w-1 h-1 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
          {activity.status === 'completed' && (
            <svg className="w-3 h-3 text-neutral-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}
