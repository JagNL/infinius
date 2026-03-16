/**
 * Memory Tools — exposed to the agent loop so the LLM can
 * explicitly read/write memory during a turn.
 *
 * Computer calls these internally as part of every turn.
 * The agent calls memory_search at turn start to retrieve context,
 * and memory_update when it learns a new durable fact.
 */

import type { RegisteredTool, ToolResult, ToolExecuteOptions } from '@infinius/agent-core';
import { MemoryClient } from '@infinius/memory';

const memoryClient = new MemoryClient();

export const memorySearchTool: RegisteredTool = {
  name: 'memory_search',
  description: 'Search the user\'s memory for personal facts, preferences, and past conversation entries. Use early in a turn to retrieve relevant context before doing work.',
  category: 'memory',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      queries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of natural language questions to search memory for (run in parallel)',
      },
      user_description: { type: 'string' },
    },
    required: ['queries', 'user_description'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { queries, user_description } = input as { queries: string[]; user_description: string };

    const results = await memoryClient.multiSearch(opts.userId, queries, { limit: 5 });

    return {
      success: true,
      output: { memories: results.map(m => ({ id: m.id, category: m.category, content: m.content, date: m.updatedAt })) },
      userDescription: user_description,
    };
  },
};

export const memoryUpdateTool: RegisteredTool = {
  name: 'memory_update',
  description: 'Store a durable fact about the user in memory for future recall. Use proactively when you learn something worth remembering: name, role, preferences, projects, corrections.',
  category: 'memory',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'A fact about the user, starting with "Remember that I..."' },
      user_description: { type: 'string', description: 'Brief description shown in activity timeline' },
    },
    required: ['content', 'user_description'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { content, user_description } = input as { content: string; user_description: string };

    // Infer category from content
    const category = inferCategory(content);

    const entry = await memoryClient.remember(opts.userId, category, content, opts.sessionId);

    return {
      success: true,
      output: { stored: entry !== null, category, content },
      userDescription: user_description,
    };
  },
};

function inferCategory(content: string): import('@infinius/memory').MemoryCategory {
  const lower = content.toLowerCase();
  if (lower.includes('prefer') || lower.includes('like') || lower.includes('dislike') || lower.includes('style')) return 'preferences';
  if (lower.includes('work') || lower.includes('role') || lower.includes('company') || lower.includes('team') || lower.includes('name')) return 'identity';
  if (lower.includes('project') || lower.includes('building') || lower.includes('goal')) return 'projects';
  if (lower.includes('don\'t') || lower.includes('never') || lower.includes('always') || lower.includes('correction')) return 'corrections';
  return 'history';
}
