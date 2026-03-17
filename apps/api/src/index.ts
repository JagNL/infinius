/**
 * Infinius API Server
 *
 * Routes:
 * - POST /api/chat                        — SSE agent turn
 * - POST /api/chat/:sessionId/interrupt   — mid-turn confirm/ask interrupt
 * - GET  /api/sessions                    — list sessions
 * - GET  /api/sessions/:id                — session + messages
 * - GET  /api/memory                      — list memories
 * - DELETE /api/memory/:id                — delete memory
 * - GET  /api/memory/search?q=            — semantic memory search
 * - GET  /api/connectors                  — list connectors + status
 * - DELETE /api/connectors/:id            — disconnect connector
 * - GET  /api/notifications               — list notifications
 * - PATCH /api/notifications/:id/read     — mark read
 * - POST  /api/notifications/read-all     — mark all read
 * - GET  /api/cron                        — list scheduled tasks
 * - PATCH /api/cron/:id                   — toggle enabled
 * - DELETE /api/cron/:id                  — delete task
 * - GET  /api/sessions/:id/files          — list shared files
 * - GET  /api/files/:id/download          — download a file
 * - GET  /health                          — health check
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import authPlugin from './middleware/auth.js';
import { chatRoutes } from './routes/chat.js';
import { sessionRoutes } from './routes/sessions.js';
import { memoryRoutes } from './routes/memory.js';
import { connectorRoutes } from './routes/connectors.js';
import { notificationRoutes } from './routes/notifications.js';
import { cronRoutes } from './routes/cron.js';
import { filesRoutes } from './routes/files.js';
import { interruptRoutes, connectInterruptPublisher } from './routes/interrupt.js';
import { Scheduler } from '@infinius/scheduler';

process.on('uncaughtException', (err) => {
  console.error('[API] Uncaught exception:', err);
  // Don't exit on Redis connection errors — Railway Redis may not be ready yet
  if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED') return;
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = String(reason);
  // Redis connection errors are non-fatal — BullMQ retries automatically
  if (msg.includes('ECONNREFUSED') || msg.includes('connect')) return;
  console.error('[API] Unhandled rejection:', reason);
});

async function main() {
  const app = Fastify({ logger: { level: 'info' } });

  await app.register(cors, {
    origin: process.env.NEXT_PUBLIC_APP_URL ?? '*',
    credentials: true,
  });

  await app.register(cookie);
  await app.register(authPlugin);

  // Public health check — registered first so it's always available
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Protected API routes (all require Authorization: Bearer <supabase-jwt>)
  await app.register(chatRoutes, { prefix: '/api' });
  await app.register(sessionRoutes, { prefix: '/api' });
  await app.register(memoryRoutes, { prefix: '/api' });
  await app.register(connectorRoutes, { prefix: '/api' });
  await app.register(notificationRoutes, { prefix: '/api' });
  await app.register(cronRoutes, { prefix: '/api' });
  await app.register(filesRoutes, { prefix: '/api' });

  // Interrupt (semi-public — validates sessionId implicitly via Redis)
  await app.register(interruptRoutes, { prefix: '/api' });

  const port = parseInt(process.env.PORT ?? process.env.API_PORT ?? '3001');
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[API] Infinius API running on port ${port}`);

  // Connect Redis publisher + start scheduler AFTER server is listening
  // so healthcheck passes even if Redis takes a moment to be ready
  connectInterruptPublisher().catch((err) =>
    console.error('[API] Redis publisher connect error (non-fatal):', err),
  );

  try {
    const scheduler = new Scheduler();
    scheduler.startWorker();
  } catch (err) {
    console.error('[API] Scheduler startWorker error (non-fatal):', err);
  }
}

main().catch((err) => {
  console.error('[API] Fatal startup error:', err);
  process.exit(1);
});
