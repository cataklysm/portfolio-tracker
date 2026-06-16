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

const ProviderUsageQuery = Type.Object({
  provider: Type.String({ minLength: 1, maxLength: 64 }),
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
  r.get('/instruments/provider-usage', { preHandler: read, schema: { querystring: ProviderUsageQuery } }, async (request) =>
    deps.service.getProviderUsage(request.query.provider),
  );

  r.get('/instruments/:id/providers', { preHandler: read }, async (request) =>
    deps.service.getInstrumentSelections((request.params as { id: string }).id),
  );

  r.put('/instruments/:id/providers', { preHandler: write, schema: { body: SetSelectionBody } }, async (request) => {
    const { id } = request.params as { id: string };
    return deps.service.setInstrumentSelection(id, request.body.capability, request.body.provider);
  });

  // Internal: the resolved refresh plan for a capability — each active listing
  // with its selected provider + that provider's symbol. Network/gateway restricted.
  r.get('/internal/refresh-plan', { schema: { querystring: CapabilityQuery } }, async (request) => {
    const ids = request.query.ids
      ?.split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return { entries: await deps.service.getRefreshPlan(request.query.capability, ids) };
  });

  // Internal: all active listings — the base set for a full-catalog refresh sweep.
  r.get('/internal/listings/all', async () => ({ listings: await deps.service.listActiveListings() }));
}
