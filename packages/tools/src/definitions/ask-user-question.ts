/**
 * ask_user_question tool
 *
 * Mid-turn interrupt that suspends the agent loop and sends a structured
 * question dialog to the frontend.  The agent resumes once the user submits
 * their answers via POST /api/chat/:sessionId/interrupt.
 *
 * Suspension mechanism: Redis pub/sub.
 *   1. Tool emits `ask_user_question` SSE event to frontend.
 *   2. Tool SUBSCRIBES to Redis channel `interrupt:{sessionId}`.
 *   3. Fastify interrupt route PUBLISHES the user's answers to that channel.
 *   4. Tool resolves with answers → agent loop continues.
 *
 * Computer equivalent: ask_user_question — gathers structured user input
 * during a multi-step task without ending the turn.
 */

import { createClient } from 'redis';
import type { RegisteredTool } from '@infinius/agent-core';

const INTERRUPT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface Question {
  question: string;
  header: string;
  multi_select?: boolean;
  options: QuestionOption[];
}

export const askUserQuestionTool: RegisteredTool = {
  name: 'ask_user_question',
  description:
    'Ask the user up to 4 structured questions with pre-defined options during a task. ' +
    'Use this BEFORE starting real work on under-specified requests. ' +
    'The agent loop is suspended until the user responds.',
  category: 'interaction',
  isVisible: false, // internal — not shown as a tool choice to the LLM
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Brief, friendly prompt explaining why you need input',
      },
      questions: {
        type: 'array',
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            header: { type: 'string', description: 'Max 12 chars chip label' },
            multi_select: { type: 'boolean' },
            options: {
              type: 'array',
              maxItems: 4,
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['label'],
              },
            },
          },
          required: ['question', 'header', 'options'],
        },
      },
    },
    required: ['title', 'questions'],
  },

  async execute(
    input: { title: string; questions: Question[] },
    opts: import('@infinius/agent-core').ToolExecuteOptions,
  ) {
    const { sessionId, sseEmit } = opts;

    const interruptId = `askq-${Date.now()}`;

    // Emit the interrupt event to the frontend
    sseEmit({
      type: 'ask_user_question',
      id: interruptId,
      title: input.title,
      questions: input.questions,
    });

    // Wait for the answer via Redis pub/sub
    const answers = await waitForInterrupt(sessionId, interruptId);

    return {
      success: true,
      output: { answers },
    };
  },
};

/**
 * Subscribes to Redis channel `interrupt:{sessionId}` and resolves
 * when a matching interrupt arrives or times out.
 */
async function waitForInterrupt(
  sessionId: string,
  interruptId: string,
): Promise<Record<number, string | string[]>> {
  const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
  await redis.connect();

  return new Promise((resolve, reject) => {
    const channel = `interrupt:${sessionId}`;
    const timeout = setTimeout(async () => {
      await redis.unsubscribe(channel);
      await redis.disconnect();
      reject(new Error('ask_user_question timed out after 10 minutes'));
    }, INTERRUPT_TIMEOUT_MS);

    redis.subscribe(channel, (message: string) => {
      try {
        const parsed = JSON.parse(message) as {
          type: string;
          id: string;
          answers?: Record<number, string | string[]>;
        };
        if (parsed.type === 'ask_user_question' && parsed.id === interruptId) {
          clearTimeout(timeout);
          redis.unsubscribe(channel).then(() => redis.disconnect());
          resolve(parsed.answers ?? {});
        }
      } catch {
        // ignore malformed messages
      }
    });
  });
}
