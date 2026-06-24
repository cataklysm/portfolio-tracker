import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { EventsService } from '../application/events-service.js';
import type { CorporateActionType } from '../application/ports.js';

const CORPORATE_ACTION_TYPES = new Set<CorporateActionType>(['split', 'reverse_split', 'dividend', 'buyback', 'spinoff', 'capital_increase']);

const EarningsQuery = Type.Object({
  instrument_id: Type.Optional(Type.String({ format: 'uuid' })),
  instrument_ids: Type.Optional(Type.String({ minLength: 1, maxLength: 16000 })),
  is_upcoming: Type.Optional(Type.Boolean()),
  date_from: Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
  date_to: Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 100000 })),
});
const CorporateActionsQuery = Type.Object({
  instrument_id: Type.Optional(Type.String({ format: 'uuid' })),
  instrument_ids: Type.Optional(Type.String({ minLength: 1, maxLength: 16000 })),
  types: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  date_from: Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
  date_to: Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 100000 })),
});
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

const EarningsPageSchema = Type.Object({
  items: Type.Array(StoredEarningsSchema),
  total: Type.Integer(),
  limit: Type.Integer(),
  offset: Type.Integer(),
});

const CorporateActionsPageSchema = Type.Object({
  items: Type.Array(StoredCorporateActionSchema),
  total: Type.Integer(),
  limit: Type.Integer(),
  offset: Type.Integer(),
});

const StoredNewsSchema = Type.Object({
  id: Type.String(),
  instrument_id: Ns,
  published_at: Type.String(),
  provider: Type.String(),
  headline: Type.String(),
  url: Ns,
  sentiment: Ns,
  category: Ns,
  relevance: Ns,
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

  r.get('/events/earnings', { preHandler: read, schema: { querystring: EarningsQuery, response: { 200: EarningsPageSchema } } }, async (request) =>
    deps.service.queryEarnings({
      instrumentIds: parseInstrumentIds(request.query.instrument_id, request.query.instrument_ids),
      isUpcoming: request.query.is_upcoming,
      dateFrom: request.query.date_from,
      dateTo: request.query.date_to,
      limit: request.query.limit ?? 100,
      offset: request.query.offset ?? 0,
    }),
  );

  r.get('/events/corporate-actions', { preHandler: read, schema: { querystring: CorporateActionsQuery, response: { 200: CorporateActionsPageSchema } } }, async (request) =>
    deps.service.queryCorporateActions({
      instrumentIds: parseInstrumentIds(request.query.instrument_id, request.query.instrument_ids),
      types: request.query.types ? parseCorporateActionTypes(request.query.types) : undefined,
      dateFrom: request.query.date_from,
      dateTo: request.query.date_to,
      limit: request.query.limit ?? 100,
      offset: request.query.offset ?? 0,
    }),
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

function parseCsv(value: string): string[] {
  return value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function parseInstrumentIds(instrumentId: string | undefined, instrumentIds: string | undefined): string[] {
  return [...(instrumentId ? [instrumentId] : []), ...(instrumentIds ? parseCsv(instrumentIds) : [])];
}

function parseCorporateActionTypes(value: string): CorporateActionType[] {
  return parseCsv(value).filter((entry): entry is CorporateActionType => CORPORATE_ACTION_TYPES.has(entry as CorporateActionType));
}
