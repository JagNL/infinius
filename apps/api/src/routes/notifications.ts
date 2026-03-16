import type { FastifyInstance } from 'fastify';
import { createClient } from '@supabase/supabase-js';

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/notifications', async (req, reply) => {
    const userId = req.headers['x-user-id'] as string;
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    return data ?? [];
  });

  app.post<{ Params: { id: string } }>('/notifications/:id/read', async (req, reply) => {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await supabase.from('notifications').update({ read: true }).eq('id', req.params.id);
    return { read: true };
  });
}
