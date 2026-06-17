import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { TaxEventService } from '../application/tax-event-service.js';
import type { TaxComponent, TaxDirection } from '../application/ports.js';
import { TaxEventRecordSchema, OkResponse } from '../../../schemas.js';

const Component = Type.Union([
  Type.Literal('capital_income'),
  Type.Literal('solidarity'),
  Type.Literal('church'),
  Type.Literal('foreign_withholding'),
  Type.Literal('generic'),
]);
const Direction = Type.Union([Type.Literal('withheld'), Type.Literal('refunded')]);
const Amount = Type.String({ pattern: '^\\d+(\\.\\d+)?$' });
const DateStr = Type.String({ format: 'date' });
const Uuid = Type.String({ format: 'uuid' });

const ListQuery = Type.Object({
  portfolio_id: Type.Optional(Uuid),
  position_id: Type.Optional(Uuid),
  transaction_id: Type.Optional(Uuid),
  cash_flow_id: Type.Optional(Uuid),
});

const CreateBody = Type.Object({
  component: Component,
  direction: Direction,
  amount: Amount,
  currency: Type.String({ minLength: 3, maxLength: 3 }),
  booking_date: DateStr,
  note: Type.Optional(Type.String({ maxLength: 280 })),
  transaction_id: Type.Optional(Uuid),
  cash_flow_id: Type.Optional(Uuid),
  position_id: Type.Optional(Uuid),
  portfolio_id: Type.Optional(Uuid),
});

const UpdateBody = Type.Object({
  component: Type.Optional(Component),
  direction: Type.Optional(Direction),
  amount: Type.Optional(Amount),
  currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
  booking_date: Type.Optional(DateStr),
  note: Type.Optional(Type.Union([Type.String({ maxLength: 280 }), Type.Null()])),
});

export interface TaxEventRouteDeps {
  service: TaxEventService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/** Recorded broker tax events. Reads need `portfolio:read`; writes `portfolio:write`. */
export function registerTaxEventRoutes(app: FastifyInstance, deps: TaxEventRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];
  const write = [deps.authenticate, deps.requireScope('portfolio:write')];

  r.get('/tax-events', { preHandler: read, schema: { querystring: ListQuery, response: { 200: Type.Array(TaxEventRecordSchema) } } }, async (request) =>
    deps.service.list(uid(request.user?.sub), {
      portfolioId: request.query.portfolio_id,
      positionId: request.query.position_id,
      transactionId: request.query.transaction_id,
      cashFlowId: request.query.cash_flow_id,
    }),
  );

  r.post('/tax-events', { preHandler: write, schema: { body: CreateBody, response: { 201: TaxEventRecordSchema } } }, async (request, reply) => {
    const created = await deps.service.create(uid(request.user?.sub), {
      component: request.body.component as TaxComponent,
      direction: request.body.direction as TaxDirection,
      amount: request.body.amount,
      currency: request.body.currency,
      bookingDate: request.body.booking_date,
      note: request.body.note ?? null,
      transactionId: request.body.transaction_id ?? null,
      cashFlowId: request.body.cash_flow_id ?? null,
      positionId: request.body.position_id ?? null,
      portfolioId: request.body.portfolio_id ?? null,
    });
    reply.code(201);
    return created;
  });

  r.patch('/tax-events/:id', { preHandler: write, schema: { body: UpdateBody, response: { 200: TaxEventRecordSchema } } }, async (request) =>
    deps.service.update(uid(request.user?.sub), (request.params as { id: string }).id, {
      component: request.body.component as TaxComponent | undefined,
      direction: request.body.direction as TaxDirection | undefined,
      amount: request.body.amount,
      currency: request.body.currency,
      bookingDate: request.body.booking_date,
      note: request.body.note,
    }),
  );

  r.delete('/tax-events/:id', { preHandler: write, schema: { response: { 200: OkResponse } } }, async (request) => {
    await deps.service.delete(uid(request.user?.sub), (request.params as { id: string }).id);
    return { ok: true as const };
  });
}

function uid(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}
