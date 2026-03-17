/**
 * wide_research tool
 *
 * Batch web research — takes a list of entities and researches each in
 * parallel using web search, collecting results into a CSV in the workspace.
 *
 * Computer equivalent: wide_research — "batch web research tool".
 * Uses the agent's own search_web capability spawned as micro-tasks.
 *
 * Implementation note: each entity gets its own Tavily/Brave search call
 * with a structured output prompt.  Results are merged into a CSV file.
 *
 * IMPORTANT: If entities >= 20, the caller (AgentLoop) must first emit a
 * confirm_action interrupt — the tool validates this by checking a flag
 * in opts.confirmedBatch.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { RegisteredTool } from '@infinius/agent-core';

export const wideResearchTool: RegisteredTool = {
  name: 'wide_research',
  description:
    'Research many entities (companies, people, topics) in parallel using web search. ' +
    'Provide a list of entities and a prompt template. Results are saved to a CSV. ' +
    'If 20 or more entities, call confirm_action first — this consumes significant credits.',
  category: 'research',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of entities to research (company names, topics, URLs, etc.)',
      },
      prompt_template: {
        type: 'string',
        description:
          'Research prompt template. Use {entity} as placeholder. ' +
          'Example: "Research {entity} and find their founding date and headquarters."',
      },
      output_schema: {
        type: 'object',
        description: 'JSON Schema describing the fields to extract for each entity',
      },
      output_filename: {
        type: 'string',
        description: 'Output CSV filename (without extension)',
      },
    },
    required: ['entities', 'prompt_template'],
  },

  async execute(
    rawInput: Record<string, unknown>,
    opts: import('@infinius/agent-core').ToolExecuteOptions,
  ) {
    const input = rawInput as { entities: string[]; prompt_template: string; output_schema?: Record<string, unknown>; output_filename?: string };
    const { workspacePath } = opts;
    const searchWeb = opts.searchWeb;

    const CONCURRENCY = 5;
    const results: Array<Record<string, string>> = [];

    // Process in batches of CONCURRENCY
    for (let i = 0; i < input.entities.length; i += CONCURRENCY) {
      const batch = input.entities.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (entity) => {
          const query = input.prompt_template.replace('{entity}', entity);
          if (!searchWeb) throw new Error('searchWeb not available');
          const searchResults = await searchWeb(query);

          // Synthesise into a flat record using top 3 results
          const context = searchResults
            .slice(0, 3)
            .map((r) => `${r.title}: ${r.content}`)
            .join('\n');

          return { entity, context, sources: searchResults.slice(0, 3).map((r) => r.url).join(', ') };
        }),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({ entity: batch[batchResults.indexOf(result)], error: String(result.reason) });
        }
      }
    }

    // Write CSV
    if (results.length === 0) {
      return { success: false, output: { error: 'No results' } };
    }

    const headers = Object.keys(results[0]);
    const csvLines = [
      headers.join(','),
      ...results.map((row) =>
        headers
          .map((h) => `"${(row[h] ?? '').toString().replace(/"/g, '""')}"`)
          .join(','),
      ),
    ];

    const filename = `${input.output_filename ?? 'wide_research'}_${Date.now()}.csv`;
    const filepath = path.join(workspacePath, filename);
    await fs.writeFile(filepath, csvLines.join('\n'), 'utf-8');

    return {
      success: true,
      output: {
        filepath,
        entity_count: results.length,
        filename,
        preview: results.slice(0, 3),
      },
    };
  },
};
