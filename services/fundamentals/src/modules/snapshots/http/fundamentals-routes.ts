import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FundamentalsService } from '../application/fundamentals-service.js';

const ListQuery = Type.Object({
  /** Comma-separated instrument UUIDs. */
  instrument_ids: Type.String({ minLength: 1, maxLength: 4000 }),
});

const RefreshBody = Type.Object({
  listing_ids: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1, maxItems: 100 }),
});

export interface FundamentalsRouteDeps {
  service: FundamentalsService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * Fundamentals read endpoints (scope `fundamentals:read`). Reads serve stored
 * snapshots only. `POST /fundamentals/refresh` is the one read-scoped endpoint
 * that may call the provider (on-demand refresh for a set of listings).
 */
export function registerFundamentalsRoutes(app: FastifyInstance, deps: FundamentalsRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('fundamentals:read')];

  r.get('/fundamentals', { preHandler: read, schema: { querystring: ListQuery } }, async (request) => {
    const ids = request.query.instrument_ids
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return deps.service.getForInstruments(ids);
  });

  r.post('/fundamentals/refresh', { preHandler: read, schema: { body: RefreshBody } }, async (request) => {
    const refreshed = await deps.service.refreshListings(request.body.listing_ids, true);
    return { refreshed };
  });
}
