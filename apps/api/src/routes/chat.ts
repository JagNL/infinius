/**
 * Chat Route — the main agent entrypoint
 *
 * POST /api/chat
 *
 * Accepts a message + session context, runs the AgentLoop,
 * and streams the response back via SSE (Server-Sent Events).
 *
 * SSE event types:
 *   { type: "text_delta", text: "..." }         — streaming text chunk
 *   { type: "tool_activity", toolName, desc }   — tool started
 *   { type: "tool_done", toolName }             — tool finished
 *   { type: "done" }                            — turn complete
 *   { type: "error", message }                  — error occurred
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { AgentLoop, ContextBuilder } from '@infinius/agent-core';
import type { LLMMessage, ModelConfig } from '@infinius/agent-core';
import { MemoryClient } from '@infinius/memory';
import { buildDefaultRegistry } from '@infinius/tools';
import { runSubagentTool } from '@infinius/orchestrator';
import { scheduleCronTool, pauseAndWaitTool } from '@infinius/scheduler';
import { listExternalToolsTool, callExternalToolTool, ConnectorRegistry } from '@infinius/connectors';
import { loadSkillTool } from '@infinius/skills';

interface ChatBody {
  message: string;
  sessionId?: string;
  modelId?: string;
}

const agentLoop = new AgentLoop();
const contextBuilder = new ContextBuilder();
const memoryClient = new MemoryClient();
const connectorRegistry = new ConnectorRegistry();

export async function chatRoutes(app: FastifyInstance) {
  app.post<{ Body: ChatBody }>('/chat', async (req: FastifyRequest<{ Body: ChatBody }>, reply: FastifyReply) => {
    const { message, sessionId, modelId } = req.body;

    // Auth: get userId from Supabase session token (optional for now)
    const authHeader = req.headers.authorization;
    let userId = 'anonymous';

    if (authHeader?.startsWith('Bearer ')) {
      try {
        const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
        const { data: { user } } = await supabase.auth.getUser(
          authHeader.replace('Bearer ', ''),
        );
        if (user) userId = user.id;
      } catch {
        // non-fatal — continue as anonymous
      }
    }
    const activeSessionId = sessionId ?? `session-${Date.now()}`;

    // ── Set up workspace ─────────────────────────────────────
    const workspacePath = path.join(
      process.env.WORKSPACE_BASE_PATH ?? '/tmp/infinius-workspaces',
      userId,
      activeSessionId,
    );
    await fs.mkdir(workspacePath, { recursive: true });

    // ── Get conversation history ──────────────────────────────
    const history = await memoryClient.getSessionHistory(activeSessionId);
    const messages: LLMMessage[] = [
      ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: message },
    ];

    // ── Build system prompt with memory ──────────────────────
    const systemPrompt = await contextBuilder.build({
      userId,
      sessionId: activeSessionId,
      userMessage: message,
      memoryClient,
    });

    // ── Build tool list (first-party + connector tools) ───────
    const toolRegistry = buildDefaultRegistry();
    const connectorTools = await connectorRegistry.buildConnectorTools(userId);

    const allTools = [
      ...toolRegistry.getAll(),
      ...connectorTools,
      // Orchestration
      runSubagentTool,
      // Scheduling
      scheduleCronTool,
      pauseAndWaitTool,
      // Connectors
      listExternalToolsTool,
      callExternalToolTool,
      // Skills
      loadSkillTool,
    ];

    const modelConfig: ModelConfig = {
      modelId: (modelId as any) ?? (process.env.DEFAULT_AGENT_MODEL as any) ?? 'claude-3-5-sonnet-20241022',
      provider: modelId?.startsWith('gpt') ? 'openai' : modelId?.startsWith('gemini') ? 'google' : 'anthropic',
    };

    // ── SSE streaming response ────────────────────────────────
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const send = (data: object) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await agentLoop.run(messages, {
        sessionId: activeSessionId,
        userId,
        workspacePath,
        modelConfig,
        systemPrompt,
        tools: allTools,
        onTextChunk: (chunk) => send({ type: 'text_delta', text: chunk }),
        onToolStart: (toolName, input, desc) => send({ type: 'tool_activity', toolName, description: desc ?? toolName, input }),
        onToolEnd: (toolName, output) => send({ type: 'tool_done', toolName, output }),
      });

      // Persist messages to session history
      await memoryClient.saveMessage(activeSessionId, userId, 'user', message);
      await memoryClient.saveMessage(activeSessionId, userId, 'assistant', result.finalText);

      // Auto-extract durable facts from this turn
      await memoryClient.extractAndStore(userId, activeSessionId, message, result.finalText);

      send({ type: 'done', steps: result.steps });
    } catch (err) {
      const error = err as Error;
      console.error('[Chat] Agent error:', error);
      send({ type: 'error', message: error.message });
    } finally {
      reply.raw.end();
    }
  });
}
