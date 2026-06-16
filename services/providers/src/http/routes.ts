import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { ProviderRegistry } from '../providers/registry.js';
import type { ProviderSettingsRepository } from '../providers/settings-repository.js';
import type { Capability, QuoteDto } from '../providers/types.js';

const UpdateProviderBody = Type.Object({
  enabled: Type.Optional(Type.Boolean()),
  data_quality: Type.Optional(
    Type.Union([Type.Literal('high'), Type.Literal('medium'), Type.Literal('low'), Type.Literal('unknown')]),
  ),
  max_batch_size: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
  rate_limit_per_min: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
  max_concurrency: Type.Optional(Type.Integer({ minimum: 1 })),
});

export interface ProviderRouteDeps {
  registry: ProviderRegistry;
  settings: ProviderSettingsRepository;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

const SymbolQuery = Type.Object({
  symbol: Type.String({ minLength: 1, maxLength: 40 }),
  /** Optional explicit provider; defaults to the first enabled provider for the capability. */
  provider: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
});

const ChartQuery = Type.Object({
  symbol: Type.String({ minLength: 1, maxLength: 40 }),
  /** Optional ISO date (YYYY-MM-DD) to start the daily series for backfill. */
  from: Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
  /** Optional explicit provider; defaults to the first enabled provider for the capability. */
  provider: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
});

const SearchQuery = Type.Object({
  q: Type.String({ minLength: 1, maxLength: 120 }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 25 })),
});

const QuotesBody = Type.Object({
  symbols: Type.Array(Type.String({ minLength: 1, maxLength: 40 }), { minItems: 1, maxItems: 200 }),
  /** Optional explicit provider; defaults to the first enabled provider for the capability. */
  provider: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
});

/**
 * Provider endpoints. The `/internal/*` routes are unauthenticated and must be
 * network/gateway restricted — the gateway never exposes `/internal/*`. The
 * `/admin/*` routes ARE gateway-exposed and require `system:admin`; they edit the
 * admin-editable provider settings in the DB.
 */
export function registerProviderRoutes(app: FastifyInstance, deps: ProviderRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const { registry, settings } = deps;
  const admin = [deps.authenticate, deps.requireScope('system:admin')];

  // What the platform can currently source, and from which provider.
  r.get('/internal/capabilities', async () => registry.capabilityMap());

  // Provider settings (class, static data-quality, refresh pacing). Read live from
  // the DB so the market scheduler picks up pacing/enable edits without a restart.
  // Consumed by the market refresh scheduler.
  r.get('/internal/providers', async () => ({ providers: await settings.listAll() }));

  // Admin (gateway-exposed, system:admin): read + edit provider settings.
  r.get('/admin/providers', { preHandler: admin }, async () => ({ providers: await settings.listAll() }));

  r.patch('/admin/providers/:provider', { preHandler: admin, schema: { body: UpdateProviderBody } }, async (request) => {
    const { provider } = request.params as { provider: string };
    const updated = await settings.update(provider, {
      enabled: request.body.enabled,
      dataQuality: request.body.data_quality,
      maxBatchSize: request.body.max_batch_size,
      rateLimitPerMin: request.body.rate_limit_per_min,
      maxConcurrency: request.body.max_concurrency,
    });
    if (!updated) throw AppError.notFound('provider_not_found', `No provider named "${provider}"`);
    return updated;
  });

  // Batch latest ticks. POST because the symbol list can be long.
  r.post('/internal/quotes', { schema: { body: QuotesBody } }, async (request) => {
    const provider = resolveProvider(registry, 'quotes', request.body.provider);
    const map = await provider.fetchQuotes!(request.body.symbols);
    const quotes: QuoteDto[] = [...map.values()];
    return { provider: provider.name, quotes };
  });

  // Single symbol + daily series (on-demand refresh / history backfill).
  r.get('/internal/chart', { schema: { querystring: ChartQuery } }, async (request) => {
    const provider = resolveProvider(registry, 'chart', request.query.provider);
    const from = parseFromDate(request.query.from);
    const chart = await provider.fetchChart!(request.query.symbol, from);
    return { provider: provider.name, chart };
  });

  r.get('/internal/search', { schema: { querystring: SearchQuery } }, async (request) => {
    const provider = registry.require('symbol_search');
    const results = await provider.searchSymbols!(request.query.q, request.query.limit ?? 10);
    return { provider: provider.name, results };
  });

  r.get('/internal/analyst', { schema: { querystring: SymbolQuery } }, async (request) => {
    const provider = resolveProvider(registry, 'analyst', request.query.provider);
    const assessment = await provider.fetchAnalyst!(request.query.symbol);
    return { provider: provider.name, assessment };
  });

  r.get('/internal/fundamentals', { schema: { querystring: SymbolQuery } }, async (request) => {
    const provider = resolveProvider(registry, 'fundamentals', request.query.provider);
    const fundamentals = await provider.fetchFundamentals!(request.query.symbol);
    return { provider: provider.name, fundamentals };
  });

  r.get('/internal/fx/rates', async () => {
    const provider = registry.require('fx');
    const rates = await provider.fetchFxRates!();
    return { provider: provider.name, rates };
  });

  r.get('/internal/earnings', { schema: { querystring: SymbolQuery } }, async (request) => {
    const provider = resolveProvider(registry, 'earnings', request.query.provider);
    const earnings = await provider.fetchEarnings!(request.query.symbol);
    return { provider: provider.name, earnings };
  });

  r.get('/internal/corporate-actions', { schema: { querystring: SymbolQuery } }, async (request) => {
    const provider = resolveProvider(registry, 'corporate_actions', request.query.provider);
    const actions = await provider.fetchCorporateActions!(request.query.symbol);
    return { provider: provider.name, actions };
  });

  r.get('/internal/news', { schema: { querystring: SymbolQuery } }, async (request) => {
    const provider = resolveProvider(registry, 'news', request.query.provider);
    const news = await provider.fetchNews!(request.query.symbol);
    return { provider: provider.name, news };
  });
}

/**
 * Resolves which provider serves a capability for this request. With an explicit
 * `name`, the named provider must be enabled and support the capability (else a
 * clean 4xx); without one, falls back to the first enabled provider (`require`).
 * Per-instrument selection lives in the instruments service, which passes the
 * resolved provider name here.
 */
function resolveProvider(registry: ProviderRegistry, capability: Capability, name: string | undefined) {
  if (!name) return registry.require(capability);
  const provider = registry.byName(name);
  if (!provider) {
    throw AppError.badRequest('unknown_provider', `No enabled provider named "${name}"`);
  }
  if (!provider.capabilities.has(capability)) {
    throw AppError.badRequest(
      'provider_capability_unsupported',
      `Provider "${name}" does not support the "${capability}" capability`,
    );
  }
  return provider;
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
