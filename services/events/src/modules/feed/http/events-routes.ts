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

const Ns = Type.Union([Type.String(), Type.Null()]);

const StoredEarningsSchema = Type.Object({
  instrument_id: Type.String(),
  fiscal_year: Type.Number(),
  fiscal_quarter: Type.Union([Type.Integer(), Type.Null()]),
  period_end_date: Ns,
  report_date: Ns,
  eps_estimate: Ns,
  eps_actual: Ns,
  revenue_estimate: Ns,
  revenue_actual: Ns,
  surprise_pct: Ns,
  provider: Type.String(),
  is_upcoming: Type.Boolean(),
});

const StoredCorporateActionSchema = Type.Object({
  stable_action_id: Type.String(),
  version: Type.Integer(),
  instrument_id: Type.String(),
  type: Type.String(),
  ex_date: Type.String(),
  ratio_numerator: Ns,
  ratio_denominator: Ns,
  dividend_amount: Ns,
  dividend_currency: Ns,
  provider: Type.String(),
});

const StoredNewsSchema = Type.Object({
  id: Type.String(),
  instrument_id: Ns,
  published_at: Type.String(),
  provider: Type.String(),
  headline: Type.String(),
  url: Ns,
  sentiment: Ns,
});

const UpcomingEarningsSchema = Type.Object({
  instrument_id: Type.String(),
  report_date: Type.String(),
});

const RefreshedResponse = Type.Object({ refreshed: Type.Integer() });

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

  r.get('/events/earnings', { preHandler: read, schema: { querystring: InstrumentQuery, response: { 200: Type.Array(StoredEarningsSchema) } } }, async (request) =>
    deps.service.getEarnings(request.query.instrument_id),
  );

  r.get('/events/corporate-actions', { preHandler: read, schema: { querystring: InstrumentQuery, response: { 200: Type.Array(StoredCorporateActionSchema) } } }, async (request) =>
    deps.service.getCorporateActions(request.query.instrument_id),
  );

  r.get('/events/news', { preHandler: read, schema: { querystring: NewsQuery, response: { 200: Type.Array(StoredNewsSchema) } } }, async (request) =>
    deps.service.getNews(request.query.instrument_id, request.query.limit),
  );

  r.post('/events/refresh', { preHandler: read, schema: { body: RefreshBody, response: { 200: RefreshedResponse } } }, async (request) => {
    const refreshed = await deps.service.refreshListings(request.body.listing_ids, true);
    return { refreshed };
  });

  // Internal: upcoming earnings per instrument for background workers (no user
  // token), e.g. the notifications evaluator. Network/gateway restricted.
  r.get('/internal/earnings', { schema: { querystring: InstrumentIdsQuery, response: { 200: Type.Array(UpcomingEarningsSchema) } } }, async (request) => {
    const ids = request.query.instrument_ids.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    return deps.service.getUpcomingEarnings(ids);
  });
}
