import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { QuoteService } from '../application/quote-service.js';
import type { AnalystService } from '../../analyst/index.js';

const QuotesQuery = Type.Object({ listing_ids: Type.String({ minLength: 1 }) });
const SeriesQuery = Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 365 })) });
const RefreshBody = Type.Object({
  listing_ids: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1 }),
  // Optional start date for the daily-history backfill (e.g. a position's first
  // transaction). Omitted → a short default window.
  from: Type.Optional(Type.String({ format: 'date' })),
});

export interface QuoteRouteDeps {
  service: QuoteService;
  analyst?: AnalystService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * Quote endpoints. Reads are public (user `market:read`) and serve stored data
 * only. The refresh trigger is internal-only (background/admin) and must be
 * network/gateway restricted; it is the path that calls the provider.
 */
export function registerQuoteRoutes(app: FastifyInstance, deps: QuoteRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('market:read')];

  r.get('/quotes', { preHandler: read, schema: { querystring: QuotesQuery } }, async (request) => {
    const ids = splitIds(request.query.listing_ids);
    return deps.service.getLatestQuotes(ids);
  });

  r.get('/quotes/:listingId/series', { preHandler: read, schema: { querystring: SeriesQuery } }, async (request) => {
    const { listingId } = request.params as { listingId: string };
    const series = await deps.service.getSeries(listingId, request.query.limit ?? 90);
    return series.map((point) => ({ time: point.time.toISOString(), price: point.price }));
  });

  // User-facing on-demand refresh: pull fresh quotes for specific listings now
  // (e.g. right after a Yahoo symbol was corrected) rather than waiting for the
  // scheduler. The one read-scope endpoint that may call the provider.
  r.post('/quotes/refresh', { preHandler: read, schema: { body: RefreshBody } }, async (request) => {
    const from = request.body.from ? new Date(request.body.from) : undefined;
    const stored = await deps.service.refreshListings(request.body.listing_ids, from);
    // Best-effort: also publish analyst assessments for these listings.
    if (deps.analyst) await deps.analyst.refreshForListings(request.body.listing_ids).catch(() => undefined);
    return { refreshed: stored };
  });

  // Internal: trigger an on-demand provider refresh. Network/gateway restricted.
  r.post('/internal/quotes/refresh', { schema: { body: RefreshBody } }, async (request) => {
    const from = request.body.from ? new Date(request.body.from) : undefined;
    const stored = await deps.service.refreshListings(request.body.listing_ids, from);
    return { refreshed: stored };
  });
}

function splitIds(raw: string): string[] {
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}
