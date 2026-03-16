/**
 * Unified LLM types across providers.
 * Computer uses Claude (primary), GPT-4o, and Gemini — all routed through
 * a single interface so the agent loop is model-agnostic.
 */

export type ModelProvider = 'anthropic' | 'openai' | 'google';

export type ModelId =
  // Anthropic
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-opus-20240229'
  // OpenAI
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4-turbo'
  // Google
  | 'gemini-1.5-pro-latest'
  | 'gemini-1.5-flash-latest';

export interface ModelConfig {
  modelId: ModelId;
  provider: ModelProvider;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
  toolCallId?: string;   // for tool result messages
  toolName?: string;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage: { inputTokens: number; outputTokens: number };
}

export interface StreamChunk {
  type: 'text_delta' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'done';
  text?: string;
  toolCall?: Partial<ToolCall>;
}
