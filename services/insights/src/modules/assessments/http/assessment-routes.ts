import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { AssessmentService } from '../application/assessment-service.js';

const InstrumentQuery = Type.Object({ instrument_id: Type.String({ format: 'uuid' }) });
const InternalTargetsQuery = Type.Object({
  user_id: Type.String({ format: 'uuid' }),
  instrument_ids: Type.String({ minLength: 1, maxLength: 4000 }),
});

const Horizon = Type.Union([Type.Literal('short'), Type.Literal('medium'), Type.Literal('long')]);

const DcfAssumptions = Type.Object({
  base_cash_flow: Type.Number(),
  growth_rate: Type.Number(),
  projection_years: Type.Integer({ minimum: 1, maximum: 50 }),
  discount_rate: Type.Number(),
  terminal_growth: Type.Number(),
  shares_outstanding: Type.Number({ exclusiveMinimum: 0 }),
  net_debt: Type.Optional(Type.Number()),
});

const CreateFairValueBody = Type.Object({
  instrument_id: Type.String({ format: 'uuid' }),
  currency: Type.String({ minLength: 3, maxLength: 3 }),
  effective_date: Type.Optional(Type.String({ format: 'date' })),
  source: Type.Optional(Type.String({ maxLength: 200 })),
  assumptions: DcfAssumptions,
});

const CreatePriceTargetBody = Type.Object({
  instrument_id: Type.String({ format: 'uuid' }),
  listing_id: Type.Optional(Type.String({ format: 'uuid' })),
  horizon: Horizon,
  zone_low: Type.Optional(Type.Number({ minimum: 0 })),
  zone_high: Type.Optional(Type.Number({ minimum: 0 })),
  currency: Type.String({ minLength: 3, maxLength: 3 }),
  effective_date: Type.Optional(Type.String({ format: 'date' })),
  note: Type.Optional(Type.String({ maxLength: 1000 })),
});

const UpdatePriceTargetBody = Type.Object({
  horizon: Type.Optional(Horizon),
  zone_low: Type.Optional(Type.Number({ minimum: 0 })),
  zone_high: Type.Optional(Type.Number({ minimum: 0 })),
  note: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
});

export interface AssessmentRouteDeps {
  service: AssessmentService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * Insight endpoints: user-owned DCF fair values and target zones (reads also
 * include global provider records). Reads need `insights:read`, writes
 * `insights:write`; writes and deletes are always scoped to the owning user.
 */
export function registerAssessmentRoutes(app: FastifyInstance, deps: AssessmentRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('insights:read')];
  const write = [deps.authenticate, deps.requireScope('insights:write')];

  // ---- Fair values --------------------------------------------------------

  r.get('/fair-values', { preHandler: read, schema: { querystring: InstrumentQuery } }, async (request) =>
    deps.service.listFairValues(uid(request.user?.sub), request.query.instrument_id),
  );

  r.post('/fair-values', { preHandler: write, schema: { body: CreateFairValueBody } }, async (request, reply) => {
    const { record, breakdown } = await deps.service.createDcfFairValue(uid(request.user?.sub), {
      instrumentId: request.body.instrument_id,
      currency: request.body.currency,
      assumptions: request.body.assumptions,
      effectiveDate: request.body.effective_date,
      source: request.body.source ?? null,
    });
    reply.code(201);
    return { ...record, breakdown };
  });

  r.delete('/fair-values/:id', { preHandler: write }, async (request) => {
    await deps.service.deleteFairValue(uid(request.user?.sub), (request.params as { id: string }).id);
    return { ok: true };
  });

  // ---- Price targets ------------------------------------------------------

  r.get('/price-targets', { preHandler: read, schema: { querystring: InstrumentQuery } }, async (request) =>
    deps.service.listPriceTargets(uid(request.user?.sub), request.query.instrument_id),
  );

  r.post('/price-targets', { preHandler: write, schema: { body: CreatePriceTargetBody } }, async (request, reply) => {
    const result = await deps.service.createPriceTarget(uid(request.user?.sub), {
      instrumentId: request.body.instrument_id,
      listingId: request.body.listing_id ?? null,
      horizon: request.body.horizon,
      zoneLow: request.body.zone_low ?? null,
      zoneHigh: request.body.zone_high ?? null,
      currency: request.body.currency,
      effectiveDate: request.body.effective_date,
      note: request.body.note ?? null,
    });
    reply.code(201);
    return result;
  });

  r.patch('/price-targets/:id', { preHandler: write, schema: { body: UpdatePriceTargetBody } }, async (request) =>
    deps.service.updatePriceTarget(uid(request.user?.sub), (request.params as { id: string }).id, {
      horizon: request.body.horizon,
      zoneLow: request.body.zone_low,
      zoneHigh: request.body.zone_high,
      note: request.body.note,
    }),
  );

  r.delete('/price-targets/:id', { preHandler: write }, async (request) => {
    await deps.service.deletePriceTarget(uid(request.user?.sub), (request.params as { id: string }).id);
    return { ok: true };
  });

  // Internal: a user's own target zones across instruments, for background
  // workers (no user token) like the notifications evaluator. Network/gateway
  // restricted.
  r.get('/internal/price-targets', { schema: { querystring: InternalTargetsQuery } }, async (request) => {
    const ids = request.query.instrument_ids.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    return deps.service.listOwnTargetsForInstruments(request.query.user_id, ids);
  });
}

function uid(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}
