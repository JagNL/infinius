/**
 * Connector Registry — OAuth integration framework
 *
 * Computer has 400+ connectors via Pipedream Connect.
 * This mirrors that architecture:
 *
 * 1. Connectors are discovered dynamically (list_external_tools)
 * 2. Users authenticate via OAuth — tokens stored securely in Supabase
 * 3. Each connector exposes typed tool definitions (search_email, send_slack, etc.)
 * 4. Tools are injected into the agent's tool list at runtime
 * 5. If a connector is DISCONNECTED, the agent offers an OAuth link
 *
 * Connector sources use Pipedream Connect or can be custom OAuth providers.
 * The agent calls list_external_tools → describe_external_tools → call_external_tool
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import type { RegisteredTool, ToolResult, ToolExecuteOptions } from '@infinius/agent-core';

export type ConnectorStatus = 'CONNECTED' | 'DISCONNECTED' | 'QUOTA_EXHAUSTED' | 'ERROR';

export interface ConnectorDefinition {
  sourceId: string;
  name: string;
  description: string;
  category: string;
  status: ConnectorStatus;
  tools: ConnectorToolDef[];
  /** OAuth initiation URL */
  authUrl?: string;
}

export interface ConnectorToolDef {
  name: string;
  description: string;
  inputSchema: object;
}

export interface ConnectedAccount {
  userId: string;
  sourceId: string;
  accountId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export class ConnectorRegistry {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  /**
   * List all available connectors for a user, with connection status.
   * Mirrors Computer's list_external_tools behaviour.
   */
  async listConnectors(userId: string, queries?: string[]): Promise<ConnectorDefinition[]> {
    // Fetch user's connected accounts from DB
    const { data: accounts } = await this.supabase
      .from('connected_accounts')
      .select('source_id')
      .eq('user_id', userId);

    const connectedSources = new Set((accounts ?? []).map((a) => a.source_id));

    // Get connector catalogue from Pipedream (or local registry)
    const catalogue = await this.getConnectorCatalogue(queries);

    return catalogue.map((connector) => ({
      ...connector,
      status: connectedSources.has(connector.sourceId) ? 'CONNECTED' : 'DISCONNECTED',
    }));
  }

  /**
   * Get OAuth initiation URL for a connector.
   * User clicks this to authorize access.
   */
  async getOAuthUrl(userId: string, sourceId: string, redirectUri: string): Promise<string> {
    // Pipedream Connect OAuth flow
    const pipedreamProjectId = process.env.PIPEDREAM_PROJECT_ID;
    if (pipedreamProjectId) {
      const response = await axios.post(
        'https://api.pipedream.com/v1/connect/tokens',
        {
          external_user_id: userId,
          allowed_origins: [redirectUri],
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PIPEDREAM_CLIENT_SECRET}`,
            'X-PD-Project-Id': pipedreamProjectId,
          },
        },
      );
      return response.data.connect_link_url;
    }

    // Fallback: direct OAuth
    return `${process.env.NEXT_PUBLIC_APP_URL}/api/connectors/oauth/start?source=${sourceId}&user=${userId}`;
  }

  /**
   * Execute a tool on a connected service.
   * Mirrors Computer's call_external_tool.
   */
  async callTool(
    userId: string,
    sourceId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const account = await this.getAccount(userId, sourceId);
    if (!account) throw new Error(`No connected account for ${sourceId}`);

    // Route to the appropriate connector implementation
    // In production: call Pipedream Actions API or custom connector handlers
    const connector = this.getConnectorHandler(sourceId);
    if (!connector) throw new Error(`No handler for connector: ${sourceId}`);

    return connector.execute(toolName, args, account);
  }

  /**
   * Build RuntimeTool objects from connected connectors.
   * Called at agent turn start to inject connector tools into the tool list.
   */
  async buildConnectorTools(userId: string): Promise<RegisteredTool[]> {
    const connectors = await this.listConnectors(userId);
    const connected = connectors.filter(c => c.status === 'CONNECTED');

    const tools: RegisteredTool[] = [];

    for (const connector of connected) {
      for (const toolDef of connector.tools) {
        const sourceId = connector.sourceId;
        const toolName = toolDef.name;

        tools.push({
          name: toolName,
          description: toolDef.description,
          category: 'connector',
          isVisible: true,
          inputSchema: toolDef.inputSchema as any,
          execute: async (input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> => {
            const result = await this.callTool(opts.userId, sourceId, toolName, input);
            return { success: true, output: result };
          },
        });
      }
    }

    return tools;
  }

  // ── Stored account management ────────────────────────────────

  async saveAccount(account: ConnectedAccount): Promise<void> {
    await this.supabase.from('connected_accounts').upsert({
      user_id: account.userId,
      source_id: account.sourceId,
      account_id: account.accountId,
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      expires_at: account.expiresAt,
      metadata: account.metadata,
    });
  }

  async getAccount(userId: string, sourceId: string): Promise<ConnectedAccount | null> {
    const { data } = await this.supabase
      .from('connected_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('source_id', sourceId)
      .single();

    if (!data) return null;

    return {
      userId: data.user_id,
      sourceId: data.source_id,
      accountId: data.account_id,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      metadata: data.metadata,
    };
  }

  async disconnectAccount(userId: string, sourceId: string): Promise<void> {
    await this.supabase
      .from('connected_accounts')
      .delete()
      .eq('user_id', userId)
      .eq('source_id', sourceId);
  }

  // ── Private helpers ─────────────────────────────────────────

  private async getConnectorCatalogue(queries?: string[]): Promise<Omit<ConnectorDefinition, 'status'>[]> {
    // In production: fetch from Pipedream's app catalogue + your custom connectors
    // Here we return a representative sample matching Computer's connector list
    return CONNECTOR_CATALOGUE.filter(c => {
      if (!queries?.length) return true;
      return queries.some(q =>
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        c.description.toLowerCase().includes(q.toLowerCase()) ||
        c.category.toLowerCase().includes(q.toLowerCase()),
      );
    });
  }

  private getConnectorHandler(_sourceId: string): { execute: (tool: string, args: Record<string, unknown>, account: ConnectedAccount) => Promise<unknown> } | null {
    // Register custom connector handlers here
    // In production: route to Pipedream Actions API
    return null;
  }
}

// ── Tool definition: list_external_tools ─────────────────────────────────────

const connectorRegistry = new ConnectorRegistry();

export const listExternalToolsTool: RegisteredTool = {
  name: 'list_external_tools',
  description: 'List available external integrations and tools. Always call this before saying you cannot access a service.',
  category: 'connector',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      queries: { type: 'array', items: { type: 'string' }, description: 'Search keywords to filter tools' },
      user_description: { type: 'string' },
    },
    required: ['user_description'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { queries, user_description } = input as { queries?: string[]; user_description: string };
    const connectors = await connectorRegistry.listConnectors(opts.userId, queries);
    return { success: true, output: { connectors }, userDescription: user_description };
  },
};

export const callExternalToolTool: RegisteredTool = {
  name: 'call_external_tool',
  description: 'Execute a tool on a connected external service (Slack, Gmail, Notion, GitHub, etc.).',
  category: 'connector',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      source_id: { type: 'string', description: 'The connector source ID (e.g. "gmail", "slack")' },
      tool_name: { type: 'string', description: 'Exact tool name from list_external_tools results' },
      arguments: { type: 'object', description: 'Arguments for the tool' },
      user_description: { type: 'string' },
    },
    required: ['source_id', 'tool_name', 'arguments', 'user_description'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { source_id, tool_name, arguments: args, user_description } = input as {
      source_id: string; tool_name: string; arguments: Record<string, unknown>; user_description: string;
    };

    const result = await connectorRegistry.callTool(opts.userId, source_id, tool_name, args);
    return { success: true, output: result, userDescription: user_description };
  },
};

// ── Connector catalogue (representative sample) ──────────────────────────────

const CONNECTOR_CATALOGUE: Omit<ConnectorDefinition, 'status'>[] = [
  {
    sourceId: 'gmail',
    name: 'Gmail',
    description: 'Search, read, send, and manage Gmail messages',
    category: 'communication',
    tools: [
      { name: 'search_email', description: 'Search Gmail messages', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      { name: 'send_email', description: 'Send an email via Gmail', inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] } },
    ],
  },
  {
    sourceId: 'slack',
    name: 'Slack',
    description: 'Send messages, search channels, and manage Slack',
    category: 'communication',
    tools: [
      { name: 'send_message', description: 'Send a Slack message', inputSchema: { type: 'object', properties: { channel: { type: 'string' }, text: { type: 'string' } }, required: ['channel', 'text'] } },
      { name: 'search_messages', description: 'Search Slack messages', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    ],
  },
  {
    sourceId: 'github_mcp_direct',
    name: 'GitHub',
    description: 'Create repos, manage issues, pull requests, and code',
    category: 'development',
    tools: [
      { name: 'create_repo', description: 'Create a GitHub repository', inputSchema: { type: 'object', properties: { name: { type: 'string' }, private: { type: 'boolean' } }, required: ['name'] } },
      { name: 'create_issue', description: 'Create a GitHub issue', inputSchema: { type: 'object', properties: { repo: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }, required: ['repo', 'title'] } },
    ],
  },
  {
    sourceId: 'notion',
    name: 'Notion',
    description: 'Read and write Notion pages and databases',
    category: 'documents',
    tools: [
      { name: 'search_pages', description: 'Search Notion pages', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      { name: 'create_page', description: 'Create a Notion page', inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, parent_id: { type: 'string' } }, required: ['title'] } },
    ],
  },
  {
    sourceId: 'google_calendar',
    name: 'Google Calendar',
    description: 'Read and create Google Calendar events',
    category: 'calendar',
    tools: [
      { name: 'list_events', description: 'List upcoming calendar events', inputSchema: { type: 'object', properties: { days_ahead: { type: 'integer' } } } },
      { name: 'create_event', description: 'Create a calendar event', inputSchema: { type: 'object', properties: { title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' } }, required: ['title', 'start', 'end'] } },
    ],
  },
  {
    sourceId: 'linear',
    name: 'Linear',
    description: 'Create and manage Linear issues and projects',
    category: 'project_management',
    tools: [
      { name: 'create_issue', description: 'Create a Linear issue', inputSchema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, team_id: { type: 'string' } }, required: ['title', 'team_id'] } },
      { name: 'search_issues', description: 'Search Linear issues', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    ],
  },
  {
    sourceId: 'supabase__pipedream',
    name: 'Supabase',
    description: 'Query and manage Supabase database tables',
    category: 'data',
    tools: [
      { name: 'query_table', description: 'Query a Supabase table', inputSchema: { type: 'object', properties: { table: { type: 'string' }, filter: { type: 'object' } }, required: ['table'] } },
    ],
  },
];
