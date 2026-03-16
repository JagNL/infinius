import type { FastifyInstance } from 'fastify';
import { MemoryClient } from '@infinius/memory';

const memoryClient = new MemoryClient();

export async function memoryRoutes(app: FastifyInstance) {
  // List all memories for a user
  app.get('/memory', async (req, reply) => {
    // In production: extract userId from JWT
    const userId = req.headers['x-user-id'] as string;
    const memories = await memoryClient.listAll(userId);
    return memories;
  });

  // Delete a specific memory (user-initiated forgetting)
  app.delete<{ Params: { id: string } }>('/memory/:id', async (req, reply) => {
    const userId = req.headers['x-user-id'] as string;
    await memoryClient.forget(userId, req.params.id);
    return { deleted: true };
  });

  // Search memory
  app.post<{ Body: { queries: string[] } }>('/memory/search', async (req, reply) => {
    const userId = req.headers['x-user-id'] as string;
    const { queries } = req.body;
    const results = await memoryClient.multiSearch(userId, queries);
    return results;
  });
}
