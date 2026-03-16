/**
 * Files Route
 *
 * GET  /api/sessions/:sessionId/files   — list files shared in a session
 * GET  /api/files/:id/download          — redirect to signed storage URL
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';

export async function filesRoutes(app: FastifyInstance) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // List files for a session
  app.get<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/files',
    { preHandler: app.authenticate },
    async (
      req: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      const { sessionId } = req.params;
      const { id: userId } = req.user;

      const { data, error } = await supabase
        .from('shared_files')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) return reply.code(500).send({ error: error.message });
      return data;
    },
  );

  // Download redirect
  app.get<{ Params: { id: string } }>(
    '/files/:id/download',
    { preHandler: app.authenticate },
    async (
      req: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = req.params;
      const { id: userId } = req.user;

      const { data: record, error } = await supabase
        .from('shared_files')
        .select('storage_key, name, mime_type')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (error || !record) return reply.code(404).send({ error: 'File not found' });

      const { data: urlData } = await supabase.storage
        .from('workspace-files')
        .createSignedUrl(record.storage_key, 300); // 5 min

      if (!urlData?.signedUrl) return reply.code(500).send({ error: 'Could not generate download URL' });

      return reply.redirect(urlData.signedUrl);
    },
  );
}
