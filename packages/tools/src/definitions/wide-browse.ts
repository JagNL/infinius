/**
 * wide_browse tool
 *
 * Batch browser automation — visits each URL or site in parallel using
 * Playwright and extracts structured data into a CSV.
 *
 * Computer equivalent: wide_browse — "batch browser automation tool".
 *
 * Uses the existing browser_task infrastructure (Playwright) with a
 * structured extraction prompt per entity.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { RegisteredTool } from '@infinius/agent-core';

export const wideBrowseTool: RegisteredTool = {
  name: 'wide_browse',
  description:
    'Visit many websites in parallel using browser automation and extract structured data. ' +
    'Provide a list of URLs/sites and a prompt template. Results saved to CSV. ' +
    'Use for collecting pricing, FAQs, product info, or any data requiring actual page visits. ' +
    'If 20 or more entities, call confirm_action first.',
  category: 'browser',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of URLs or site names to visit',
      },
      prompt_template: {
        type: 'string',
        description:
          'Task prompt for each site. Use {entity} as placeholder. ' +
          'Example: "Go to {entity}, find the pricing page, extract all plans and prices."',
      },
      output_schema: {
        type: 'object',
        description: 'JSON Schema describing the fields to extract for each site',
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
    const browserTask = opts.browserTask;

    const CONCURRENCY = 3; // browser tasks are heavier, lower concurrency
    const results: Array<Record<string, string>> = [];

    for (let i = 0; i < input.entities.length; i += CONCURRENCY) {
      const batch = input.entities.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (entity) => {
          const task = input.prompt_template.replace('{entity}', entity);
          // Determine URL: if entity looks like a URL use it, else search-navigate
          const url = entity.startsWith('http')
            ? entity
            : `https://${entity}`;

          if (!browserTask) throw new Error('browserTask not available');
          const raw = await browserTask(url, task);
          return { entity, result: raw };
        }),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            entity: batch[batchResults.indexOf(result)],
            error: String(result.reason),
          });
        }
      }
    }

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

    const filename = `${input.output_filename ?? 'wide_browse'}_${Date.now()}.csv`;
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
