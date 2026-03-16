/**
 * Multi-provider LLM client.
 *
 * Computer routes different tasks to different models:
 *  - Complex reasoning → Claude 3.5 Sonnet (default)
 *  - Fast/cheap tasks → GPT-4o-mini
 *  - Subagents → configurable per spawn
 *
 * This client normalises all three providers to one interface.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  ModelConfig,
  LLMMessage,
  LLMResponse,
  ToolCall,
  StreamChunk,
} from './types.js';
import type { ToolDefinition } from '../tools/types.js';

export class LLMClient {
  private anthropic: Anthropic;
  private openai: OpenAI;
  private google: GoogleGenerativeAI;

  constructor() {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.google = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
  }

  async complete(
    config: ModelConfig,
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMResponse> {
    switch (config.provider) {
      case 'anthropic': return this.completeAnthropic(config, messages, tools);
      case 'openai':    return this.completeOpenAI(config, messages, tools);
      case 'google':    return this.completeGoogle(config, messages, tools);
    }
  }

  async *stream(
    config: ModelConfig,
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): AsyncGenerator<StreamChunk> {
    switch (config.provider) {
      case 'anthropic': yield* this.streamAnthropic(config, messages, tools); break;
      case 'openai':    yield* this.streamOpenAI(config, messages, tools); break;
      default: throw new Error(`Streaming not supported for provider: ${config.provider}`);
    }
  }

  // ── Anthropic ───────────────────────────────────────────────

  private async completeAnthropic(
    config: ModelConfig,
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMResponse> {
    const systemMessages = messages.filter(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const response = await this.anthropic.messages.create({
      model: config.modelId,
      max_tokens: config.maxTokens ?? 8096,
      system: config.systemPrompt ?? systemMessages.map(m => m.content).join('\n'),
      messages: chatMessages.map(this.toAnthropicMessage),
      tools: tools.map(this.toAnthropicTool),
    });

    const textContent = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');

    const toolCalls: ToolCall[] = response.content
      .filter(b => b.type === 'tool_use')
      .map(b => {
        const tb = b as Anthropic.ToolUseBlock;
        return { id: tb.id, name: tb.name, input: tb.input as Record<string, unknown> };
      });

    return {
      content: textContent,
      toolCalls,
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }

  private async *streamAnthropic(
    config: ModelConfig,
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): AsyncGenerator<StreamChunk> {
    const systemMessages = messages.filter(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const stream = this.anthropic.messages.stream({
      model: config.modelId,
      max_tokens: config.maxTokens ?? 8096,
      system: config.systemPrompt ?? systemMessages.map(m => m.content).join('\n'),
      messages: chatMessages.map(this.toAnthropicMessage),
      tools: tools.map(this.toAnthropicTool),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text_delta', text: event.delta.text };
      }
    }

    yield { type: 'done' };
  }

  // ── OpenAI ──────────────────────────────────────────────────

  private async completeOpenAI(
    config: ModelConfig,
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMResponse> {
    const response = await this.openai.chat.completions.create({
      model: config.modelId,
      messages: messages.map(this.toOpenAIMessage),
      tools: tools.map(this.toOpenAITool),
      tool_choice: tools.length ? 'auto' : undefined,
    });

    const choice = response.choices[0];
    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      content: choice.message.content ?? '',
      toolCalls,
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
      usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 },
    };
  }

  private async *streamOpenAI(
    config: ModelConfig,
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): AsyncGenerator<StreamChunk> {
    const stream = await this.openai.chat.completions.create({
      model: config.modelId,
      messages: messages.map(this.toOpenAIMessage),
      tools: tools.map(this.toOpenAITool),
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield { type: 'text_delta', text: delta.content };
      }
    }

    yield { type: 'done' };
  }

  // ── Google ──────────────────────────────────────────────────

  private async completeGoogle(
    config: ModelConfig,
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMResponse> {
    const model = this.google.getGenerativeModel({ model: config.modelId });
    const chat = model.startChat({
      history: messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
      })),
    });

    const last = messages[messages.length - 1];
    const result = await chat.sendMessage(typeof last.content === 'string' ? last.content : JSON.stringify(last.content));
    const text = result.response.text();

    return {
      content: text,
      toolCalls: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  // ── Normalisation helpers ────────────────────────────────────

  private toAnthropicMessage(msg: LLMMessage): Anthropic.MessageParam {
    if (msg.role === 'tool') {
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.toolCallId!,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        }],
      };
    }
    return {
      role: msg.role as 'user' | 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    };
  }

  private toAnthropicTool(tool: ToolDefinition): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
    };
  }

  private toOpenAIMessage(msg: LLMMessage): OpenAI.ChatCompletionMessageParam {
    if (msg.role === 'tool') {
      return { role: 'tool', tool_call_id: msg.toolCallId!, content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) };
    }
    if (msg.role === 'system') {
      return { role: 'system', content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) };
    }
    return {
      role: msg.role as 'user' | 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    };
  }

  private toOpenAITool(tool: ToolDefinition): OpenAI.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    };
  }
}
