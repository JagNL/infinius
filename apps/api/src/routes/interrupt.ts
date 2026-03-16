/**
 * Interrupt Route
 *
 * POST /api/chat/:sessionId/interrupt
 *
 * Receives user responses from ConfirmActionDialog or AskUserQuestionDialog
 * and publishes them to the Redis pub/sub channel the suspended tool is
 * listening on.
 *
 * Body shapes:
 *   { type: 'confirm_action', id: string, approved: boolean }
 *   { type: 'ask_user_question', id: string, answers: Record<number, string|string[]> }
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from 'redis';

interface InterruptBody {
  type: 'confirm_action' | 'ask_user_question';
  id: string;
  approved?: boolean;
  answers?: Record<number, string | string[]>;
}

const redisPublisher = createClient({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
});

// Connect once at startup (called from index.ts)
let connected = false;
export async function connectInterruptPublisher() {
  if (!connected) {
    await redisPublisher.connect();
    connected = true;
  }
}

export async function interruptRoutes(app: FastifyInstance) {
  app.post<{ Params: { sessionId: string }; Body: InterruptBody }>(
    '/chat/:sessionId/interrupt',
    async (
      req: FastifyRequest<{ Params: { sessionId: string }; Body: InterruptBody }>,
      reply: FastifyReply,
    ) => {
      const { sessionId } = req.params;
      const body = req.body;

      if (!body.type || !body.id) {
        return reply.code(400).send({ error: 'Missing type or id' });
      }

      const channel = `interrupt:${sessionId}`;
      await redisPublisher.publish(channel, JSON.stringify(body));

      return reply.send({ ok: true });
    },
  );
}
