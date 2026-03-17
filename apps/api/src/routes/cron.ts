import type { FastifyInstance } from 'fastify';
import { Scheduler } from '@infinius/scheduler';

// Lazy — don't instantiate at module load (Queue constructor throws if REDIS_URL bad)
let _scheduler: Scheduler | null = null;
function getScheduler(): Scheduler {
  if (!_scheduler) _scheduler = new Scheduler();
  return _scheduler;
}

export async function cronRoutes(app: FastifyInstance) {
  app.get('/cron', async (req, reply) => {
    const userId = req.headers['x-user-id'] as string;
    return getScheduler().listCrons(userId);
  });

  app.delete<{ Params: { id: string } }>('/cron/:id', async (req, reply) => {
    await getScheduler().deleteCron(req.params.id);
    return { deleted: true };
  });
}
