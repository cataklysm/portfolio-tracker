import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { SelectionService } from '../application/selection-service.js';

const CapabilityQuery = Type.Object({
  capability: Type.String({ minLength: 1, maxLength: 32 }),
  /** Optional comma-separated listing UUIDs to restrict the plan to. */
  ids: Type.Optional(Type.String({ minLength: 1 })),
});

const SetSelectionBody = Type.Object({
  capability: Type.String({ minLength: 1, maxLength: 32 }),
  provider: Type.String({ minLength: 1, maxLength: 64 }),
});

const SetSelectionsBody = Type.Object({
  selections: Type.Array(SetSelectionBody, { minItems: 1, maxItems: 16 }),
});

const ProviderUsageQuery = Type.Object({
  provider: Type.String({ minLength: 1, maxLength: 64 }),
});

const Ns = Type.Union([Type.String(), Type.Null()]);
const MarketStatusSchema = Type.Union([
  Type.Literal('open'), Type.Literal('closed'), Type.Literal('holiday'), Type.Literal('weekend'), Type.Literal('unknown'),
]);
const SelectableCapabilitySchema = Type.Union([
  Type.Literal('quotes'), Type.Literal('chart'), Type.Literal('analyst'), Type.Literal('fundamentals'),
  Type.Literal('earnings'), Type.Literal('corporate_actions'), Type.Literal('news'),
]);

const ProviderSelectionViewSchema = Type.Object({
  capability: SelectableCapabilitySchema,
  provider: Type.String(),
});

const RefreshPlanEntrySchema = Type.Object({
  listing_id: Type.String(),
  instrument_id: Type.String(),
  symbol: Type.String(),
  currency: Type.String(),
  provider: Ns,
  provider_identifier: Ns,
  market_status: MarketStatusSchema,
  minutes_since_close: Type.Union([Type.Number(), Type.Null()]),
});

const ActiveListingSchema = Type.Object({
  listing_id: Type.String(),
  instrument_id: Type.String(),
  symbol: Type.String(),
  currency: Type.String(),
  exchange_mic: Ns,
});

const ProviderUsageViewSchema = Type.Object({
  instrument_id: Type.String(),
  instrument_name: Type.String(),
  capability: SelectableCapabilitySchema,
});

export interface SelectionRouteDeps {
  service: SelectionService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * Provider-selection endpoints. Per-instrument selection reads/writes require the
 * usual instruments scopes; the `/internal/*` resolution endpoints are
 * unauthenticated and must be network/gateway restricted (the market refresh
 * worker consumes them).
 */
export function registerSelectionRoutes(app: FastifyInstance, deps: SelectionRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('instruments:read')];
  const write = [deps.authenticate, deps.requireScope('instruments:write')];

  // Static path registered before `/instruments/:id` semantics — Fastify favors the
  // static route, so it is not shadowed by the catalog's `/instruments/:id`.
  r.get('/instruments/provider-usage', { preHandler: read, schema: { querystring: ProviderUsageQuery, response: { 200: Type.Array(ProviderUsageViewSchema) } } }, async (request) =>
    deps.service.getProviderUsage(request.query.provider),
  );

  r.get('/instruments/:id/providers', { preHandler: read, schema: { response: { 200: Type.Array(ProviderSelectionViewSchema) } } }, async (request) =>
    deps.service.getInstrumentSelections((request.params as { id: string }).id),
  );

  r.put('/instruments/:id/providers', { preHandler: write, schema: { body: SetSelectionBody, response: { 200: Type.Array(ProviderSelectionViewSchema) } } }, async (request) => {
    const { id } = request.params as { id: string };
    return deps.service.setInstrumentSelection(id, request.body.capability, request.body.provider);
  });

  // Set several capability → provider selections in one call (one Save in the
  // symbols admin). Each selection still expands to its feed group server-side.
  r.put('/instruments/:id/provider-selections', { preHandler: write, schema: { body: SetSelectionsBody, response: { 200: Type.Array(ProviderSelectionViewSchema) } } }, async (request) => {
    const { id } = request.params as { id: string };
    return deps.service.setInstrumentSelections(id, request.body.selections);
  });

  // Internal: the resolved refresh plan for a capability — each active listing
  // with its selected provider + that provider's symbol. Network/gateway restricted.
  r.get('/internal/refresh-plan', { schema: { querystring: CapabilityQuery, response: { 200: Type.Object({ entries: Type.Array(RefreshPlanEntrySchema) }) } } }, async (request) => {
    const ids = request.query.ids
      ?.split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return { entries: await deps.service.getRefreshPlan(request.query.capability, ids) };
  });

  // Internal: all active listings — the base set for a full-catalog refresh sweep.
  r.get('/internal/listings/all', { schema: { response: { 200: Type.Object({ listings: Type.Array(ActiveListingSchema) }) } } }, async () => ({ listings: await deps.service.listActiveListings() }));
}
