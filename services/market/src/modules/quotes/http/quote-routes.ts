import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { QuoteService } from '../application/quote-service.js';
import type { AnalystService } from '../../analyst/index.js';

const QuotesQuery = Type.Object({ listing_ids: Type.String({ minLength: 1 }) });
const SeriesQuery = Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 365 })) });
const HistoryQuery = Type.Object({
  from: Type.String({ format: 'date' }),
  to: Type.String({ format: 'date' }),
});
const RefreshBody = Type.Object({
  listing_ids: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1 }),
  // Optional start date for the daily-history backfill (e.g. a position's first
  // transaction). Omitted → a short default window.
  from: Type.Optional(Type.String({ format: 'date' })),
});

const RebuildBody = Type.Object({
  listing_ids: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1 }),
  // Rebuild range start (the instrument's first-acquisition date). Omitted → a
  // short default window.
  from: Type.Optional(Type.String({ format: 'date' })),
  // Explicit confirmation — this purges the listings' entire stored price history.
  confirm: Type.Boolean(),
});

const PurgeBody = Type.Object({
  listing_ids: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1 }),
  // Explicit confirmation — this deletes the listings' entire stored price history.
  confirm: Type.Boolean(),
});

const Ns = Type.Union([Type.String(), Type.Null()]);

const QuoteViewSchema = Type.Object({
  listing_id: Type.String(),
  latest: Ns,
  previous: Ns,
  currency: Ns,
  latest_at: Ns,
  retrieved_at: Ns,
  freshness_status: Type.Union([Type.Literal('fresh'), Type.Literal('stale'), Type.Literal('unavailable')]),
  provider: Ns,
  provider_timestamp: Ns,
});

const SeriesPointSchema = Type.Object({ time: Type.String(), price: Type.String(), volume: Ns });
const DailyCloseSchema = Type.Object({ date: Type.String(), price: Type.String(), volume: Ns });
const RebuildResponse = Type.Object({ purged: Type.Integer(), rebuilt: Type.Integer() });
const PurgeResponse = Type.Object({ purged: Type.Integer() });
const RefreshedResponse = Type.Object({ refreshed: Type.Integer() });

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
  const admin = [deps.authenticate, deps.requireScope('system:admin')];

  r.get('/quotes', { preHandler: read, schema: { querystring: QuotesQuery, response: { 200: Type.Array(QuoteViewSchema) } } }, async (request) => {
    const ids = splitIds(request.query.listing_ids);
    return deps.service.getLatestQuotes(ids);
  });

  r.get('/quotes/:listingId/series', { preHandler: read, schema: { querystring: SeriesQuery, response: { 200: Type.Array(SeriesPointSchema) } } }, async (request) => {
    const { listingId } = request.params as { listingId: string };
    const series = await deps.service.getSeries(listingId, request.query.limit ?? 90);
    return series.map((point) => ({ time: point.time.toISOString(), price: point.price, volume: point.volume }));
  });

  // Daily closing prices over a date range, for historical reporting (the
  // portfolio performance series). Serves stored data only.
  r.get('/quotes/:listingId/history', { preHandler: read, schema: { querystring: HistoryQuery, response: { 200: Type.Array(DailyCloseSchema) } } }, async (request) => {
    const { listingId } = request.params as { listingId: string };
    return deps.service.getDailyHistory(listingId, request.query.from, request.query.to);
  });

  // Admin: purge + rebuild a listing's stored price history from its currently
  // selected provider (after switching the quotes/chart provider). Destructive —
  // requires `confirm`. Gateway-exposed under `/quotes`, system:admin.
  r.post('/quotes/rebuild', { preHandler: admin, schema: { body: RebuildBody, response: { 200: RebuildResponse } } }, async (request) => {
    if (!request.body.confirm) {
      throw AppError.badRequest(
        'confirmation_required',
        "Rebuild purges the listings' stored price history; set confirm=true to proceed",
      );
    }
    const from = request.body.from ? new Date(request.body.from) : undefined;
    return deps.service.purgeAndRebuild(request.body.listing_ids, from);
  });

  // Admin: purge a listing's stored price history without refetching it. Useful
  // when a bad provider mapping polluted the cache and the rebuild should happen
  // separately (for example with a provider that can backfill a deeper history).
  r.post('/quotes/purge', { preHandler: admin, schema: { body: PurgeBody, response: { 200: PurgeResponse } } }, async (request) => {
    if (!request.body.confirm) {
      throw AppError.badRequest(
        'confirmation_required',
        "Purge deletes the listings' stored price history; set confirm=true to proceed",
      );
    }
    const purged = await deps.service.purgeListings(request.body.listing_ids);
    return { purged };
  });

  // User-facing on-demand refresh: pull fresh quotes for specific listings now
  // (e.g. right after a Yahoo symbol was corrected) rather than waiting for the
  // scheduler. The one read-scope endpoint that may call the provider.
  r.post('/quotes/refresh', { preHandler: read, schema: { body: RefreshBody, response: { 200: RefreshedResponse } } }, async (request) => {
    const from = request.body.from ? new Date(request.body.from) : undefined;
    const stored = await deps.service.refreshListings(request.body.listing_ids, from);
    // Best-effort: also publish analyst assessments for these listings.
    if (deps.analyst) await deps.analyst.refreshForListings(request.body.listing_ids).catch(() => undefined);
    return { refreshed: stored };
  });

  // Internal: trigger an on-demand provider refresh. Network/gateway restricted.
  r.post('/internal/quotes/refresh', { schema: { body: RefreshBody, response: { 200: RefreshedResponse } } }, async (request) => {
    const from = request.body.from ? new Date(request.body.from) : undefined;
    const stored = await deps.service.refreshListings(request.body.listing_ids, from);
    return { refreshed: stored };
  });

  // Internal: latest stored quotes for background workers (no user token), e.g.
  // the notifications evaluator. Network/gateway restricted; serves stored data.
  r.get('/internal/quotes', { schema: { querystring: QuotesQuery, response: { 200: Type.Array(QuoteViewSchema) } } }, async (request) =>
    deps.service.getLatestQuotes(splitIds(request.query.listing_ids)),
  );

  // Internal: purge + rebuild a listing's stored price history from its currently
  // selected provider (after an admin switches the quotes/chart provider, so the
  // series never mixes two sources). Destructive — requires explicit confirm.
  // Network/gateway restricted.
  r.post('/internal/quotes/rebuild', { schema: { body: RebuildBody, response: { 200: RebuildResponse } } }, async (request) => {
    if (!request.body.confirm) {
      throw AppError.badRequest(
        'confirmation_required',
        "Rebuild purges the listings' stored price history; set confirm=true to proceed",
      );
    }
    const from = request.body.from ? new Date(request.body.from) : undefined;
    return deps.service.purgeAndRebuild(request.body.listing_ids, from);
  });

  // Internal: purge stored price history without refetching. Network/gateway
  // restricted.
  r.post('/internal/quotes/purge', { schema: { body: PurgeBody, response: { 200: PurgeResponse } } }, async (request) => {
    if (!request.body.confirm) {
      throw AppError.badRequest(
        'confirmation_required',
        "Purge deletes the listings' stored price history; set confirm=true to proceed",
      );
    }
    const purged = await deps.service.purgeListings(request.body.listing_ids);
    return { purged };
  });
}

function splitIds(raw: string): string[] {
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}
