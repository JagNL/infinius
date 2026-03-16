/**
 * confirm_action tool
 *
 * Mid-turn interrupt that requires explicit user approval before executing
 * a destructive or irreversible action (send email, delete data, purchase, etc.).
 *
 * Suspension mechanism: same Redis pub/sub gate as ask_user_question.
 *   1. Emits `confirm_action` SSE event → frontend shows approve/deny dialog.
 *   2. Subscribes to Redis `interrupt:{sessionId}`.
 *   3. Fastify interrupt route publishes { type, id, approved: boolean }.
 *   4. If approved → resolves "approved".  If denied → throws so agent stops.
 *
 * Computer equivalent: confirm_action — guards all side-effect actions.
 */

import { createClient } from 'redis';
import type { RegisteredTool } from '../registry/types.js';

const INTERRUPT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export const confirmActionTool: RegisteredTool = {
  name: 'confirm_action',
  description:
    'Request user confirmation before executing an action that is irreversible, expensive, ' +
    'or has significant side effects (sending communications, purchases, deletions, public posts). ' +
    'ALWAYS call this before such actions UNLESS the user explicitly said not to ask.',
  category: 'interaction',
  isVisible: false,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Short action label e.g. "send email", "delete file", "make purchase"',
      },
      question: {
        type: 'string',
        description: 'Brief confirmation question for the user',
      },
      placeholder: {
        type: 'string',
        description:
          'The complete draft content to show the user (full email body, message text, etc.)',
      },
    },
    required: ['action', 'question'],
  },

  async execute(
    input: { action: string; question: string; placeholder?: string },
    opts,
  ) {
    const { sessionId, sseEmit } = opts as {
      sessionId: string;
      sseEmit: (event: unknown) => void;
    };

    const interruptId = `confirm-${Date.now()}`;

    // Emit SSE event to frontend
    sseEmit({
      type: 'confirm_action',
      id: interruptId,
      action: input.action,
      question: input.question,
      placeholder: input.placeholder ?? '',
    });

    // Wait for approval / denial
    const approved = await waitForConfirm(sessionId, interruptId);

    if (!approved) {
      throw new Error(
        `Action "${input.action}" was denied by the user. Do not proceed.`,
      );
    }

    return {
      success: true,
      output: { approved: true, action: input.action },
    };
  },
};

async function waitForConfirm(
  sessionId: string,
  interruptId: string,
): Promise<boolean> {
  const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
  await redis.connect();

  return new Promise((resolve, reject) => {
    const channel = `interrupt:${sessionId}`;
    const timeout = setTimeout(async () => {
      await redis.unsubscribe(channel);
      await redis.disconnect();
      reject(new Error('confirm_action timed out — treating as denied'));
    }, INTERRUPT_TIMEOUT_MS);

    redis.subscribe(channel, (message) => {
      try {
        const parsed = JSON.parse(message) as {
          type: string;
          id: string;
          approved?: boolean;
        };
        if (parsed.type === 'confirm_action' && parsed.id === interruptId) {
          clearTimeout(timeout);
          redis.unsubscribe(channel).then(() => redis.disconnect());
          resolve(parsed.approved ?? false);
        }
      } catch {
        // ignore
      }
    });
  });
}
