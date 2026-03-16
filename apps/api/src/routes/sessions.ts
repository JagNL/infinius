import type { FastifyInstance } from 'fastify';
import { createClient } from '@supabase/supabase-js';

export async function sessionRoutes(app: FastifyInstance) {
  // List all sessions for the authenticated user
  app.get('/sessions', async (req, reply) => {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await supabase
      .from('sessions')
      .select('id, title, created_at, last_message_at, model_id')
      .order('last_message_at', { ascending: false });
    return data ?? [];
  });

  // Get session detail: messages + tool activity
  app.get<{ Params: { id: string } }>('/sessions/:id', async (req, reply) => {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { id } = req.params;

    const [messages, activity] = await Promise.all([
      supabase.from('session_messages').select('*').eq('session_id', id).order('created_at'),
      supabase.from('tool_activity').select('*').eq('session_id', id).order('started_at'),
    ]);

    return { messages: messages.data ?? [], toolActivity: activity.data ?? [] };
  });

  // Delete a session
  app.delete<{ Params: { id: string } }>('/sessions/:id', async (req, reply) => {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await supabase.from('sessions').delete().eq('id', req.params.id);
    return { deleted: true };
  });
}
