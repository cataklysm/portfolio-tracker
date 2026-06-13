import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { ProviderRegistry } from '../providers/registry.js';
import type { QuoteDto } from '../providers/types.js';

const SymbolQuery = Type.Object({
  symbol: Type.String({ minLength: 1, maxLength: 40 }),
});

const ChartQuery = Type.Object({
  symbol: Type.String({ minLength: 1, maxLength: 40 }),
  /** Optional ISO date (YYYY-MM-DD) to start the daily series for backfill. */
  from: Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
});

const SearchQuery = Type.Object({
  q: Type.String({ minLength: 1, maxLength: 120 }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 25 })),
});

const QuotesBody = Type.Object({
  symbols: Type.Array(Type.String({ minLength: 1, maxLength: 40 }), { minItems: 1, maxItems: 200 }),
});

/**
 * Internal provider endpoints. These are unauthenticated and must be network/
 * gateway restricted — the gateway never exposes `/internal/*`. Every route
 * routes its capability through the registry, which raises a 501 when no
 * configured provider supports it.
 */
export function registerProviderRoutes(app: FastifyInstance, registry: ProviderRegistry): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();

  // What the platform can currently source, and from which provider.
  r.get('/internal/capabilities', async () => registry.capabilityMap());

  // Batch latest ticks. POST because the symbol list can be long.
  r.post('/internal/quotes', { schema: { body: QuotesBody } }, async (request) => {
    const provider = registry.require('quotes');
    const map = await provider.fetchQuotes!(request.body.symbols);
    const quotes: QuoteDto[] = [...map.values()];
    return { provider: provider.name, quotes };
  });

  // Single symbol + daily series (on-demand refresh / history backfill).
  r.get('/internal/chart', { schema: { querystring: ChartQuery } }, async (request) => {
    const provider = registry.require('chart');
    const from = parseFromDate(request.query.from);
    const chart = await provider.fetchChart!(request.query.symbol, from);
    return { provider: provider.name, chart };
  });

  r.get('/internal/search', { schema: { querystring: SearchQuery } }, async (request) => {
    const provider = registry.require('search');
    const results = await provider.search!(request.query.q, request.query.limit ?? 10);
    return { provider: provider.name, results };
  });

  r.get('/internal/analyst', { schema: { querystring: SymbolQuery } }, async (request) => {
    const provider = registry.require('analyst');
    const assessment = await provider.fetchAnalyst!(request.query.symbol);
    return { provider: provider.name, assessment };
  });

  r.get('/internal/fundamentals', { schema: { querystring: SymbolQuery } }, async (request) => {
    const provider = registry.require('fundamentals');
    const fundamentals = await provider.fetchFundamentals!(request.query.symbol);
    return { provider: provider.name, fundamentals };
  });

  r.get('/internal/fx/rates', async () => {
    const provider = registry.require('fx');
    const rates = await provider.fetchFxRates!();
    return { provider: provider.name, rates };
  });

  r.get('/internal/earnings', { schema: { querystring: SymbolQuery } }, async (request) => {
    const provider = registry.require('earnings');
    const earnings = await provider.fetchEarnings!(request.query.symbol);
    return { provider: provider.name, earnings };
  });

  r.get('/internal/corporate-actions', { schema: { querystring: SymbolQuery } }, async (request) => {
    const provider = registry.require('corporate_actions');
    const actions = await provider.fetchCorporateActions!(request.query.symbol);
    return { provider: provider.name, actions };
  });

  r.get('/internal/news', { schema: { querystring: SymbolQuery } }, async (request) => {
    const provider = registry.require('news');
    const news = await provider.fetchNews!(request.query.symbol);
    return { provider: provider.name, news };
  });
}

/** Parses a YYYY-MM-DD `from` param into a UTC date, rejecting malformed input. */
function parseFromDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const ms = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(ms)) {
    throw AppError.badRequest('invalid_from_date', '`from` must be an ISO date (YYYY-MM-DD)');
  }
  return new Date(ms);
}
