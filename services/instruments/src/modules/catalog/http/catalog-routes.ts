import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { CatalogService } from '../application/catalog-service.js';

const SearchQuery = Type.Object({
  q: Type.String({ minLength: 1, maxLength: 120 }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
});

const BatchListingsQuery = Type.Object({
  ids: Type.String({ minLength: 1, description: 'Comma-separated listing UUIDs' }),
});

const ResolveQuery = Type.Object({
  provider: Type.String({ minLength: 1, maxLength: 64 }),
  ids: Type.String({ minLength: 1, description: 'Comma-separated listing UUIDs' }),
});

const ProviderIdentifier = Type.Object({
  provider: Type.String({ minLength: 1, maxLength: 64 }),
  provider_identifier: Type.String({ minLength: 1, maxLength: 128 }),
});

const CreateInstrumentBody = Type.Object({
  instrument: Type.Object({
    name: Type.String({ minLength: 1, maxLength: 200 }),
    asset_type: Type.String(),
    isin: Type.Optional(Type.String({ maxLength: 12 })),
    underlying_identifier: Type.Optional(Type.String({ maxLength: 64 })),
  }),
  listing: Type.Object({
    exchange_id: Type.Optional(Type.String({ format: 'uuid' })),
    exchange_mic: Type.Optional(Type.String({ maxLength: 8 })),
    symbol: Type.String({ minLength: 1, maxLength: 32 }),
    currency: Type.String({ minLength: 3, maxLength: 3 }),
  }),
  provider_identifier: Type.Optional(ProviderIdentifier),
});

const UpdateInstrumentBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  isin: Type.Optional(Type.Union([Type.String({ maxLength: 12 }), Type.Null()])),
})

const UpdateListingBody = Type.Object({
  symbol: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
  exchange_id: Type.Optional(Type.String({ format: 'uuid' })),
  provider_identifiers: Type.Optional(Type.Array(ProviderIdentifier)),
})

const CreateExchangeBody = Type.Object({
  mic: Type.String({ minLength: 1, maxLength: 8 }),
  name: Type.String({ minLength: 1, maxLength: 120 }),
  timezone: Type.String({ minLength: 1, maxLength: 64 }),
  regular_open_local: Type.Optional(Type.String({ maxLength: 8 })),
  regular_close_local: Type.Optional(Type.String({ maxLength: 8 })),
});

const UpdateExchangeBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  timezone: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  regular_open_local: Type.Optional(Type.Union([Type.String({ maxLength: 8 }), Type.Null()])),
  regular_close_local: Type.Optional(Type.Union([Type.String({ maxLength: 8 }), Type.Null()])),
  holidays: Type.Optional(Type.Array(Type.String({ minLength: 10, maxLength: 10 }))),
});

const Ns = Type.Union([Type.String(), Type.Null()]);
const AssetTypeSchema = Type.Union([Type.Literal('equity'), Type.Literal('crypto'), Type.Literal('fund'), Type.Literal('index')]);
const MarketStatusSchema = Type.Union([
  Type.Literal('open'), Type.Literal('closed'), Type.Literal('holiday'), Type.Literal('weekend'), Type.Literal('unknown'),
]);

const ExchangeViewSchema = Type.Object({
  id: Type.String(),
  mic: Type.String(),
  name: Type.String(),
  timezone: Type.String(),
  regular_open_local: Ns,
  regular_close_local: Ns,
});

const ListingViewSchema = Type.Object({
  id: Type.String(),
  instrument_id: Type.String(),
  symbol: Type.String(),
  currency: Type.String(),
  exchange_id: Ns,
  exchange_mic: Ns,
  active: Type.Boolean(),
});

const ProviderIdentifierViewSchema = Type.Object({
  provider: Type.String(),
  provider_identifier: Type.String(),
});

const ListingDetailSchema = Type.Intersect([
  ListingViewSchema,
  Type.Object({ provider_identifiers: Type.Array(ProviderIdentifierViewSchema) }),
]);

const AdminSymbolViewSchema = Type.Intersect([
  ListingDetailSchema,
  Type.Object({
    instrument_name: Type.String(),
    asset_type: AssetTypeSchema,
    isin: Ns,
    underlying_identifier: Ns,
    in_use: Type.Boolean(),
    provider_selections: Type.Array(Type.Object({ capability: Type.String(), provider: Type.String() })),
  }),
]);

const InstrumentViewSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  asset_type: AssetTypeSchema,
  isin: Ns,
  primary_listing_id: Ns,
});

const InstrumentWithListingsSchema = Type.Intersect([
  InstrumentViewSchema,
  Type.Object({ listings: Type.Array(ListingViewSchema) }),
]);

const ListingSummarySchema = Type.Object({
  listing_id: Type.String(),
  instrument_id: Type.String(),
  symbol: Type.String(),
  name: Type.String(),
  asset_type: AssetTypeSchema,
  currency: Type.String(),
});

const BenchmarkCatalogEntrySchema = Type.Object({
  key: Type.String(),
  name: Type.String(),
  region: Ns,
  listing_id: Type.String(),
  instrument_id: Type.String(),
  symbol: Type.String(),
  currency: Type.String(),
});

const ListingSessionViewSchema = Type.Object({
  listing_id: Type.String(),
  mic: Ns,
  timezone: Ns,
  status: MarketStatusSchema,
  local_date: Ns,
  current_trading_date: Ns,
  previous_trading_date: Ns,
});

const ProviderListingSchema = Type.Object({
  listing_id: Type.String(),
  instrument_id: Type.String(),
  symbol: Type.String(),
  currency: Type.String(),
  provider_identifier: Ns,
});

const RegisterListingResultSchema = Type.Object({
  instrumentId: Type.String(),
  listingId: Type.String(),
  created: Type.Boolean(),
});

export interface CatalogRouteDeps {
  service: CatalogService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * Catalog endpoints. Reads require `instruments:read`; creation requires
 * `instruments:write`. Instrument/listing/exchange data is global, so any
 * authenticated user with the scope may read it.
 */
export function registerCatalogRoutes(app: FastifyInstance, deps: CatalogRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('instruments:read')];
  const write = [deps.authenticate, deps.requireScope('instruments:write')];
  const admin = [deps.authenticate, deps.requireScope('system:admin')];

  r.get('/exchanges', { preHandler: read, schema: { response: { 200: Type.Array(ExchangeViewSchema) } } }, async () => deps.service.listExchanges());

  // Curated benchmark catalog: stable keys resolving to seeded index listings.
  r.get('/benchmarks', { preHandler: read, schema: { response: { 200: Type.Array(BenchmarkCatalogEntrySchema) } } }, async () => deps.service.listBenchmarkCatalog());

  r.post('/exchanges', { preHandler: write, schema: { body: CreateExchangeBody, response: { 201: Type.Object({ id: Type.String() }) } } }, async (request, reply) => {
    const result = await deps.service.createExchange({
      mic: request.body.mic,
      name: request.body.name,
      timezone: request.body.timezone,
      regularOpenLocal: request.body.regular_open_local ?? null,
      regularCloseLocal: request.body.regular_close_local ?? null,
    });
    reply.code(201);
    return result;
  });

  r.patch('/exchanges/:id', { preHandler: write, schema: { body: UpdateExchangeBody, response: { 200: ExchangeViewSchema } } }, async (request) => {
    const { id } = request.params as { id: string };
    return deps.service.updateExchange(id, {
      name: request.body.name,
      timezone: request.body.timezone,
      regularOpenLocal: request.body.regular_open_local,
      regularCloseLocal: request.body.regular_close_local,
      holidays: request.body.holidays,
    });
  });

  r.get('/instruments/search', { preHandler: read, schema: { querystring: SearchQuery, response: { 200: Type.Array(InstrumentWithListingsSchema) } } }, async (request) =>
    deps.service.searchInstruments(request.query.q, request.query.limit),
  );

  r.get('/instruments/:id', { preHandler: read, schema: { response: { 200: InstrumentWithListingsSchema } } }, async (request) =>
    deps.service.getInstrument((request.params as { id: string }).id),
  );

  r.patch('/instruments/:id', { preHandler: write, schema: { body: UpdateInstrumentBody, response: { 200: InstrumentWithListingsSchema } } }, async (request) => {
    const { id } = request.params as { id: string };
    return deps.service.updateInstrument(id, { name: request.body.name, isin: request.body.isin });
  });

  r.post('/instruments', { preHandler: write, schema: { body: CreateInstrumentBody, response: { 201: RegisterListingResultSchema } } }, async (request, reply) => {
    const result = await deps.service.createInstrument(request.body);
    reply.code(201);
    return result;
  });

  r.get('/instruments/admin/symbols', { preHandler: admin, schema: { response: { 200: Type.Array(AdminSymbolViewSchema) } } }, async () => deps.service.listAdminSymbols());

  r.delete('/instruments/admin/symbols/:id', { preHandler: admin }, async (request, reply) => {
    await deps.service.deactivateListing((request.params as { id: string }).id);
    reply.code(204);
  });

  r.get('/listings', { preHandler: read, schema: { querystring: BatchListingsQuery, response: { 200: Type.Array(ListingSummarySchema) } } }, async (request) => {
    const ids = request.query.ids
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return deps.service.getListingsByIds(ids);
  });

  // Current market-session state (open/closed/holiday/weekend) for listings'
  // exchanges. Static path; registered before /listings/:id so it is not shadowed.
  r.get('/listings/sessions', { preHandler: read, schema: { querystring: BatchListingsQuery, response: { 200: Type.Array(ListingSessionViewSchema) } } }, async (request) => {
    const ids = request.query.ids
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return deps.service.getListingSessions(ids);
  });

  r.get('/listings/:id', { preHandler: read, schema: { response: { 200: ListingDetailSchema } } }, async (request) =>
    deps.service.getListing((request.params as { id: string }).id),
  );

  r.patch('/listings/:id', { preHandler: write, schema: { body: UpdateListingBody, response: { 200: ListingDetailSchema } } }, async (request) => {
    const { id } = request.params as { id: string };
    return deps.service.updateListing(id, {
      symbol: request.body.symbol,
      currency: request.body.currency,
      exchangeId: request.body.exchange_id,
      providerIdentifiers: request.body.provider_identifiers?.map((pi) => ({
        provider: pi.provider,
        providerIdentifier: pi.provider_identifier,
      })),
    });
  });

  // Internal: resolve listing -> provider symbol for the market refresh worker.
  // Internal-only and must be network/gateway restricted.
  r.get('/internal/listings/resolve', { schema: { querystring: ResolveQuery, response: { 200: Type.Array(ProviderListingSchema) } } }, async (request) => {
    const ids = request.query.ids
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return deps.service.resolveProviderListings(ids, request.query.provider);
  });
}
