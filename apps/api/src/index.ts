/**
 * Infinius API Server
 *
 * Fastify server exposing:
 * - POST /api/chat          — Start or continue a session, returns SSE stream
 * - GET  /api/sessions      — List user sessions
 * - GET  /api/sessions/:id  — Get session messages + tool activity
 * - GET  /api/memory        — List user memories
 * - DELETE /api/memory/:id  — Delete a memory
 * - GET  /api/connectors    — List connectors with status
 * - POST /api/connectors/:id/connect — Initiate OAuth
 * - GET  /api/notifications — List notifications
 * - POST /api/cron          — Create/delete/list scheduled tasks
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { chatRoutes } from './routes/chat.js';
import { sessionRoutes } from './routes/sessions.js';
import { memoryRoutes } from './routes/memory.js';
import { connectorRoutes } from './routes/connectors.js';
import { notificationRoutes } from './routes/notifications.js';
import { cronRoutes } from './routes/cron.js';
import { Scheduler } from '@infinius/scheduler';

const app = Fastify({ logger: { level: 'info' } });

await app.register(cors, {
  origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  credentials: true,
});

await app.register(cookie);

// Routes
await app.register(chatRoutes, { prefix: '/api' });
await app.register(sessionRoutes, { prefix: '/api' });
await app.register(memoryRoutes, { prefix: '/api' });
await app.register(connectorRoutes, { prefix: '/api' });
await app.register(notificationRoutes, { prefix: '/api' });
await app.register(cronRoutes, { prefix: '/api' });

// Health check
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// Start scheduler worker
const scheduler = new Scheduler();
scheduler.startWorker();

const port = parseInt(process.env.API_PORT ?? '3001');
await app.listen({ port, host: '0.0.0.0' });
console.log(`[API] Infinius API running on port ${port}`);
