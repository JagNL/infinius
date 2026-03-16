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
  | 'memory'
  | 'orchestration'
  | 'scheduling'
  | 'connector'
  | 'media'
  | 'document'
  | 'notification';

export interface ToolExecuteOptions {
  sessionId: string;
  workspacePath: string;
  userId: string;
  signal?: AbortSignal;
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

// Minimal JSON Schema subset used for tool inputs
export interface JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export type JSONSchemaProperty =
  | { type: 'string'; description?: string; enum?: string[] }
  | { type: 'number'; description?: string }
  | { type: 'integer'; description?: string }
  | { type: 'boolean'; description?: string }
  | { type: 'array'; items: JSONSchemaProperty; description?: string }
  | { type: 'object'; properties?: Record<string, JSONSchemaProperty>; description?: string };
