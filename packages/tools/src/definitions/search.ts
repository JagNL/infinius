/**
 * Search Tools
 *
 * Computer uses: Brave Search (fast web), Tavily (research-grade),
 * and specialised verticals (academic, people, image, video, shopping).
 */

import type { RegisteredTool, ToolResult, ToolExecuteOptions } from '@infinius/agent-core';
import axios from 'axios';

export const searchWebTool: RegisteredTool = {
  name: 'search_web',
  description: 'Search the web for current information. Returns titles, URLs, and content snippets. Use for news, prices, facts, or any publicly available information.',
  category: 'research',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      queries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of search queries (max 3). Short, keyword-focused. Run in parallel.',
      },
    },
    required: ['queries'],
  },
  async execute(input: Record<string, unknown>, _opts: ToolExecuteOptions): Promise<ToolResult> {
    const queries = input.queries as string[];

    const results = await Promise.all(
      queries.slice(0, 3).map(q => searchBrave(q)),
    );

    return {
      success: true,
      output: results.flat(),
      userDescription: `Searching the web for: ${queries.join(', ')}`,
    };
  },
};

async function searchBrave(query: string): Promise<unknown[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error('BRAVE_SEARCH_API_KEY not set');

  const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
    headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
    params: { q: query, count: 10 },
  });

  return (response.data.web?.results ?? []).map((r: Record<string, unknown>) => ({
    title: r.title,
    url: r.url,
    description: r.description,
  }));
}

export const fetchUrlTool: RegisteredTool = {
  name: 'fetch_url',
  description: 'Fetch and read the content of a specific URL. Optionally extract specific information via a prompt. Use for reading articles, docs, and pages.',
  category: 'research',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
      prompt: { type: 'string', description: 'Optional: extract specific info from the page' },
    },
    required: ['url'],
  },
  async execute(input: Record<string, unknown>, _opts: ToolExecuteOptions): Promise<ToolResult> {
    const { url, prompt } = input as { url: string; prompt?: string };

    // Use Tavily for content extraction if available
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      const res = await axios.post(
        'https://api.tavily.com/extract',
        { urls: [url] },
        { headers: { Authorization: `Bearer ${tavilyKey}` } },
      );
      const content = res.data.results?.[0]?.raw_content ?? '';
      return {
        success: true,
        output: { url, content: content.slice(0, 40000), prompt },
        userDescription: `Reading: ${url}`,
      };
    }

    // Fallback: basic axios fetch
    const res = await axios.get(url, { responseType: 'text', timeout: 10000 });
    return {
      success: true,
      output: { url, content: (res.data as string).slice(0, 40000) },
      userDescription: `Reading: ${url}`,
    };
  },
};

export const searchVerticalTool: RegisteredTool = {
  name: 'search_vertical',
  description: 'Search specialised verticals: academic (papers), people (LinkedIn), image, video, or shopping.',
  category: 'research',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      vertical: {
        type: 'string',
        enum: ['academic', 'people', 'image', 'video', 'shopping'],
        description: 'The search vertical',
      },
      query: { type: 'string', description: '2-5 word search query' },
    },
    required: ['vertical', 'query'],
  },
  async execute(input: Record<string, unknown>, _opts: ToolExecuteOptions): Promise<ToolResult> {
    const { vertical, query } = input as { vertical: string; query: string };

    // Route to appropriate API based on vertical
    // In production: Serper Images API, Semantic Scholar, LinkedIn API, etc.
    return {
      success: true,
      output: { vertical, query, message: `Search ${vertical} for: ${query}` },
      userDescription: `Searching ${vertical} for: ${query}`,
    };
  },
};
