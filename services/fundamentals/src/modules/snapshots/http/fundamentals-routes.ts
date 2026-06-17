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

const Ns = Type.Union([Type.String(), Type.Null()]);

const FundamentalsViewSchema = Type.Object({
  instrument_id: Type.String(),
  effective_date: Type.String(),
  provider: Type.String(),
  currency: Ns,
  pe_ratio: Ns,
  pb_ratio: Ns,
  ps_ratio: Ns,
  dividend_yield: Ns,
  eps: Ns,
  market_cap: Ns,
  revenue: Ns,
  revenue_growth: Ns,
  earnings_growth: Ns,
  shares_outstanding: Ns,
  net_debt: Ns,
  extra: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
  as_of: Type.String(),
});

const RefreshedResponse = Type.Object({ refreshed: Type.Integer() });

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

  r.get('/fundamentals', { preHandler: read, schema: { querystring: ListQuery, response: { 200: Type.Array(FundamentalsViewSchema) } } }, async (request) => {
    const ids = request.query.instrument_ids
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return deps.service.getForInstruments(ids);
  });

  r.post('/fundamentals/refresh', { preHandler: read, schema: { body: RefreshBody, response: { 200: RefreshedResponse } } }, async (request) => {
    const refreshed = await deps.service.refreshListings(request.body.listing_ids, true);
    return { refreshed };
  });
}
