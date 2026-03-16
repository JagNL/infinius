/**
 * Auth middleware for Fastify
 *
 * Validates the Supabase JWT from the Authorization header on every
 * protected route.  Attaches `req.user` for downstream handlers.
 *
 * Usage:
 *   await app.register(authPlugin);
 *   // then on any route:
 *   { preHandler: app.authenticate }
 *
 * Public routes (health, interrupt with internal-secret header) bypass auth.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { createClient } from '@supabase/supabase-js';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; email: string | undefined };
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPlugin(app: FastifyInstance) {
  app.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
      }

      const token = authHeader.slice(7);
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
      );

      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return reply.code(401).send({ error: 'Invalid or expired token' });
      }

      req.user = { id: user.id, email: user.email };
    },
  );

  // Decorate request with empty user so TypeScript is happy before auth runs
  app.decorateRequest('user', null);
}

export default fp(authPlugin, { name: 'auth' });
