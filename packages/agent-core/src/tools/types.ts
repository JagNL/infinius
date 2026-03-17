/**
 * Tool system types.
 *
 * Computer has ~50 first-party tools plus dynamic connector tools.
 * Every tool has: a name, JSON Schema input, and an async execute function.
 * The agent loop calls execute() and feeds the result back to the LLM.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  /** Which category this tool belongs to — used for UI grouping */
  category: ToolCategory;
  /** If true, shown in the activity timeline as a visible action */
  isVisible: boolean;
}

export type ToolCategory =
  | 'research'
  | 'browser'
  | 'code'
  | 'filesystem'
  | 'files'
  | 'memory'
  | 'orchestration'
  | 'scheduling'
  | 'connector'
  | 'media'
  | 'document'
  | 'notification'
  | 'interaction';

export interface ToolExecuteOptions {
  sessionId: string;
  workspacePath: string;
  userId: string;
  signal?: AbortSignal;
  /** Emit an SSE event directly to the frontend (used by interrupt tools) */
  sseEmit?: (event: unknown) => void;
  /** Web search helper injected by the agent loop (used by wide_research) */
  searchWeb?: (query: string) => Promise<Array<{ title: string; url: string; content: string }>>;
  /** Browser task helper injected by the agent loop (used by wide_browse) */
  browserTask?: (url: string, task: string) => Promise<string>;
}

export interface ToolResult {
  success: boolean;
  output: unknown;
  /** Human-readable description shown in the activity timeline */
  userDescription?: string;
  error?: string;
}

export type ToolExecuteFn = (
  input: Record<string, unknown>,
  options: ToolExecuteOptions,
) => Promise<ToolResult>;

export interface RegisteredTool extends ToolDefinition {
  execute: ToolExecuteFn;
}

// Minimal JSON Schema subset used for tool inputs.
// The index signature ([key: string]: unknown) is required so this is
// compatible with OpenAI's FunctionParameters type.
export interface JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export type JSONSchemaProperty =
  | { type: 'string'; description?: string; enum?: string[] }
  | { type: 'number'; description?: string }
  | { type: 'integer'; description?: string }
  | { type: 'boolean'; description?: string }
  | { type: 'array'; items: JSONSchemaProperty; description?: string; maxItems?: number; minItems?: number }
  | { type: 'object'; properties?: Record<string, JSONSchemaProperty>; description?: string; required?: string[]; additionalProperties?: boolean };
