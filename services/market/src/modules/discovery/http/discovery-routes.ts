import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { DiscoveryService } from '../application/discovery-service.js';

const SearchQuery = Type.Object({
  q: Type.String({ minLength: 1, maxLength: 120 }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 25 })),
});

export interface DiscoveryRouteDeps {
  service: DiscoveryService;
}

/**
 * Internal provider-discovery endpoint. The instruments service calls this
 * during search; it is internal-only and must be network/gateway restricted.
 */
export function registerDiscoveryRoutes(app: FastifyInstance, deps: DiscoveryRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  r.get('/internal/discovery/search', { schema: { querystring: SearchQuery } }, async (request) =>
    deps.service.search(request.query.q, request.query.limit),
  );
}
