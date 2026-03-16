/**
 * The Agent Loop — the heart of the system.
 *
 * This mirrors exactly how Computer works:
 *  1. Build context (system prompt + memory + conversation history)
 *  2. Call LLM with all available tools
 *  3. If LLM returns tool calls → execute them → append results → loop
 *  4. If LLM returns end_turn → stream final text to user
 *  5. After turn → persist durable facts to memory
 *
 * The loop runs until the model stops calling tools (end_turn)
 * or a step limit is reached (safety valve).
 */

import { LLMClient } from '../llm/client.js';
import type { LLMMessage, ModelConfig, StreamChunk } from '../llm/types.js';
import type { RegisteredTool, ToolExecuteOptions } from '../tools/types.js';

const MAX_STEPS = 50; // safety valve — Computer uses ~200 for complex tasks

export interface AgentLoopOptions {
  sessionId: string;
  userId: string;
  workspacePath: string;
  modelConfig: ModelConfig;
  systemPrompt: string;
  tools: RegisteredTool[];
  /** Called for each streamed text chunk */
  onTextChunk?: (chunk: string) => void;
  /** Called when a tool starts executing */
  onToolStart?: (toolName: string, input: Record<string, unknown>, description?: string) => void;
  /** Called when a tool finishes */
  onToolEnd?: (toolName: string, result: unknown) => void;
}

export interface AgentTurnResult {
  finalText: string;
  toolCallsMade: Array<{ name: string; input: Record<string, unknown>; output: unknown }>;
  steps: number;
}

export class AgentLoop {
  private llm: LLMClient;

  constructor() {
    this.llm = new LLMClient();
  }

  async run(
    messages: LLMMessage[],
    opts: AgentLoopOptions,
  ): Promise<AgentTurnResult> {
    const {
      sessionId, userId, workspacePath,
      modelConfig, systemPrompt, tools,
      onTextChunk, onToolStart, onToolEnd,
    } = opts;

    const execOptions: ToolExecuteOptions = { sessionId, userId, workspacePath };

    // Build working message list — system prompt is injected at the front
    const workingMessages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const toolCallHistory: AgentTurnResult['toolCallsMade'] = [];
    let steps = 0;
    let finalText = '';

    // ── Agentic Loop ──────────────────────────────────────────
    while (steps < MAX_STEPS) {
      steps++;

      const response = await this.llm.complete(modelConfig, workingMessages, tools);

      // Accumulate any text content
      if (response.content) {
        finalText += response.content;
        onTextChunk?.(response.content);
      }

      // No tool calls → agent is done
      if (response.stopReason === 'end_turn' || response.toolCalls.length === 0) {
        break;
      }

      // Append the assistant's response (with tool calls) to history
      workingMessages.push({
        role: 'assistant',
        content: response.content,
      });

      // Execute all tool calls in parallel (same as Computer does)
      const toolResults = await Promise.all(
        response.toolCalls.map(async (tc) => {
          const tool = tools.find(t => t.name === tc.name);

          if (!tool) {
            return {
              toolCallId: tc.id,
              toolName: tc.name,
              result: { success: false, error: `Unknown tool: ${tc.name}`, output: null },
            };
          }

          onToolStart?.(tc.name, tc.input, tool.isVisible ? tc.name : undefined);

          const result = await tool.execute(tc.input, execOptions);

          onToolEnd?.(tc.name, result.output);

          toolCallHistory.push({ name: tc.name, input: tc.input, output: result.output });

          return { toolCallId: tc.id, toolName: tc.name, result };
        }),
      );

      // Append tool results back to the message list
      for (const tr of toolResults) {
        workingMessages.push({
          role: 'tool',
          content: JSON.stringify(tr.result.output),
          toolCallId: tr.toolCallId,
          toolName: tr.toolName,
        });
      }
    }

    return { finalText, toolCallsMade: toolCallHistory, steps };
  }

  /**
   * Streaming variant — yields text chunks in real time while
   * still executing tool calls between LLM turns.
   */
  async *stream(
    messages: LLMMessage[],
    opts: AgentLoopOptions,
  ): AsyncGenerator<StreamChunk | { type: 'tool_activity'; toolName: string; description: string }> {
    const {
      sessionId, userId, workspacePath,
      modelConfig, systemPrompt, tools,
    } = opts;

    const execOptions: ToolExecuteOptions = { sessionId, userId, workspacePath };

    const workingMessages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    let steps = 0;

    while (steps < MAX_STEPS) {
      steps++;

      // First get a non-streaming completion to check for tool calls
      const response = await this.llm.complete(modelConfig, workingMessages, tools);

      if (response.content) {
        yield { type: 'text_delta', text: response.content };
      }

      if (response.stopReason === 'end_turn' || response.toolCalls.length === 0) {
        yield { type: 'done' };
        break;
      }

      workingMessages.push({ role: 'assistant', content: response.content });

      // Execute tools, yielding activity events to the UI
      const toolResults = await Promise.all(
        response.toolCalls.map(async (tc) => {
          const tool = tools.find(t => t.name === tc.name);

          yield { type: 'tool_activity' as const, toolName: tc.name, description: tc.name };

          if (!tool) {
            return { toolCallId: tc.id, toolName: tc.name, output: { error: `Unknown tool: ${tc.name}` } };
          }

          const result = await tool.execute(tc.input, execOptions);
          return { toolCallId: tc.id, toolName: tc.name, output: result.output };
        }),
      );

      for (const tr of toolResults) {
        workingMessages.push({
          role: 'tool',
          content: JSON.stringify(tr.output),
          toolCallId: tr.toolCallId,
          toolName: tr.toolName,
        });
      }
    }
  }
}
