import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { EventsService } from '../application/events-service.js';

const InstrumentQuery = Type.Object({ instrument_id: Type.String({ format: 'uuid' }) });
const NewsQuery = Type.Object({
  instrument_id: Type.String({ format: 'uuid' }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
});
const RefreshBody = Type.Object({
  listing_ids: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1, maxItems: 100 }),
});
const InstrumentIdsQuery = Type.Object({ instrument_ids: Type.String({ minLength: 1, maxLength: 4000 }) });

export interface EventsRouteDeps {
  service: EventsService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * Event read endpoints (scope `events:read`), grouped under `/events`. Reads
 * serve stored data only. `POST /events/refresh` is the one read-scoped endpoint
 * that may call the provider (on-demand refresh for a set of listings).
 */
export function registerEventsRoutes(app: FastifyInstance, deps: EventsRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('events:read')];

  r.get('/events/earnings', { preHandler: read, schema: { querystring: InstrumentQuery } }, async (request) =>
    deps.service.getEarnings(request.query.instrument_id),
  );

  r.get('/events/corporate-actions', { preHandler: read, schema: { querystring: InstrumentQuery } }, async (request) =>
    deps.service.getCorporateActions(request.query.instrument_id),
  );

  r.get('/events/news', { preHandler: read, schema: { querystring: NewsQuery } }, async (request) =>
    deps.service.getNews(request.query.instrument_id, request.query.limit),
  );

  r.post('/events/refresh', { preHandler: read, schema: { body: RefreshBody } }, async (request) => {
    const refreshed = await deps.service.refreshListings(request.body.listing_ids, true);
    return { refreshed };
  });

  // Internal: upcoming earnings per instrument for background workers (no user
  // token), e.g. the notifications evaluator. Network/gateway restricted.
  r.get('/internal/earnings', { schema: { querystring: InstrumentIdsQuery } }, async (request) => {
    const ids = request.query.instrument_ids.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    return deps.service.getUpcomingEarnings(ids);
  });
}
