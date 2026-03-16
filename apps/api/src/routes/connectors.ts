import type { FastifyInstance } from 'fastify';
import { ConnectorRegistry } from '@infinius/connectors';

const connectorRegistry = new ConnectorRegistry();

export async function connectorRoutes(app: FastifyInstance) {
  // List available connectors with status
  app.get('/connectors', async (req, reply) => {
    const userId = req.headers['x-user-id'] as string;
    return connectorRegistry.listConnectors(userId);
  });

  // Initiate OAuth for a connector
  app.post<{ Params: { id: string } }>('/connectors/:id/connect', async (req, reply) => {
    const userId = req.headers['x-user-id'] as string;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/connectors/callback`;
    const url = await connectorRegistry.getOAuthUrl(userId, req.params.id, redirectUri);
    return { authUrl: url };
  });

  // OAuth callback
  app.get<{ Querystring: { code: string; state: string } }>('/connectors/callback', async (req, reply) => {
    // Handle OAuth callback — exchange code for tokens
    // Implementation depends on specific provider
    return reply.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings/connectors?connected=true`);
  });

  // Disconnect a connector
  app.delete<{ Params: { id: string } }>('/connectors/:id', async (req, reply) => {
    const userId = req.headers['x-user-id'] as string;
    await connectorRegistry.disconnectAccount(userId, req.params.id);
    return { disconnected: true };
  });
}
