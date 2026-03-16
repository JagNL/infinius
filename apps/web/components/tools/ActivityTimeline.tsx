'use client';

import type { ToolActivity } from '../../lib/types';

interface ActivityTimelineProps {
  activities: ToolActivity[];
}

const TOOL_ICONS: Record<string, string> = {
  search_web: '🔍',
  fetch_url: '🌐',
  bash: '⚡',
  browser_task: '🖥️',
  screenshot_page: '📸',
  read_file: '📄',
  write_file: '✏️',
  memory_search: '🧠',
  memory_update: '💾',
  run_subagent: '🤖',
  schedule_cron: '⏰',
  pause_and_wait: '⏸️',
  load_skill: '📚',
  send_notification: '🔔',
  list_external_tools: '🔌',
  call_external_tool: '⚙️',
};

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const recent = activities.slice(-10); // Show last 10

  return (
    <div className="px-4 py-2 border-t border-gray-800/50">
      <div className="max-w-4xl mx-auto space-y-1">
        {recent.map(activity => (
          <div key={activity.id} className="flex items-center gap-2 text-xs text-gray-500">
            <span>{TOOL_ICONS[activity.toolName] ?? '🔧'}</span>
            <span className={activity.status === 'running' ? 'text-indigo-400 animate-pulse' : 'text-gray-500'}>
              {activity.description}
            </span>
            {activity.status === 'running' && (
              <span className="inline-block w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
            )}
            {activity.status === 'completed' && (
              <span className="text-green-600">✓</span>
            )}
            {activity.status === 'failed' && (
              <span className="text-red-500">✗</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
