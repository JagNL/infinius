import type { FastifyInstance } from 'fastify';
import { Scheduler } from '@infinius/scheduler';

const scheduler = new Scheduler();

export async function cronRoutes(app: FastifyInstance) {
  app.get('/cron', async (req, reply) => {
    const userId = req.headers['x-user-id'] as string;
    return scheduler.listCrons(userId);
  });

  app.delete<{ Params: { id: string } }>('/cron/:id', async (req, reply) => {
    await scheduler.deleteCron(req.params.id);
    return { deleted: true };
  });
}
