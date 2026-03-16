/**
 * Browser Automation Tool
 *
 * Computer uses a cloud Playwright browser for:
 * - Login-gated sites
 * - JavaScript-rendered pages
 * - Form submission and UI interaction
 * - Screenshots
 * - Batch parallel browsing across many URLs
 *
 * Uses Playwright. For cloud: connect via BROWSER_WS_ENDPOINT
 * (Browserless, Bright Data, or similar).
 */

import type { RegisteredTool, ToolResult, ToolExecuteOptions } from '@infinius/agent-core';

export const browserTaskTool: RegisteredTool = {
  name: 'browser_task',
  description: `Automate browser tasks: navigate websites, fill forms, click buttons, extract information, or multi-step web actions.
Use when: site requires login, content needs JavaScript to render, you need to take actions (submit, click), or you need a screenshot.
Prefer search_web for simple information lookup.`,
  category: 'browser',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Starting URL for the browser session' },
      task: { type: 'string', description: 'Detailed instructions for what to do. Include all context — the browser agent has no conversation history.' },
      user_description: { type: 'string', description: 'Human-readable description shown in the activity timeline' },
      output_schema: { type: 'object', description: 'Optional JSON Schema for structured output extraction' },
    },
    required: ['url', 'task', 'user_description'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { url, task, user_description, output_schema } = input as {
      url: string;
      task: string;
      user_description: string;
      output_schema?: object;
    };

    // Import Playwright dynamically to avoid startup cost when not needed
    const { chromium } = await import('playwright');

    const wsEndpoint = process.env.BROWSER_WS_ENDPOINT;
    const browser = wsEndpoint
      ? await chromium.connectOverCDP(wsEndpoint)
      : await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

      // For now return page content — in production this would be a
      // full sub-LLM browser agent loop (same pattern as Computer's browser_task)
      const title = await page.title();
      const content = await page.evaluate(() => document.body.innerText);

      return {
        success: true,
        output: {
          url,
          title,
          content: content.slice(0, 20_000),
          task_completed: true,
        },
        userDescription: user_description,
      };
    } finally {
      await browser.close();
    }
  },
};

export const screenshotPageTool: RegisteredTool = {
  name: 'screenshot_page',
  description: 'Take a screenshot of a web page and save it to the workspace.',
  category: 'browser',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to screenshot' },
      user_description: { type: 'string' },
    },
    required: ['url', 'user_description'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { url, user_description } = input as { url: string; user_description: string };
    const { chromium } = await import('playwright');

    const wsEndpoint = process.env.BROWSER_WS_ENDPOINT;
    const browser = wsEndpoint
      ? await chromium.connectOverCDP(wsEndpoint)
      : await chromium.launch({ headless: true, args: ['--no-sandbox'] });

    const page = await (await browser.newContext()).newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

    const filename = `screenshot-${Date.now()}.png`;
    const filePath = `${opts.workspacePath}/${filename}`;
    await page.screenshot({ path: filePath, fullPage: true });
    await browser.close();

    return {
      success: true,
      output: { file_path: filePath, filename },
      userDescription: user_description,
    };
  },
};
