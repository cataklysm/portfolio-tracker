import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { CashFlowService } from '../application/cash-flow-service.js';
import type { CashFlowType } from '../application/ports.js';

const CashFlowKind = Type.Union([
  Type.Literal('dividend'),
  Type.Literal('deposit'),
  Type.Literal('withdrawal'),
  Type.Literal('cash_in_lieu'),
]);
const Amount = Type.String({ pattern: '^-?\\d+(\\.\\d+)?$' });
const DateStr = Type.String({ format: 'date' });

const ListQuery = Type.Object({
  type: Type.Optional(CashFlowKind),
  position_id: Type.Optional(Type.String({ format: 'uuid' })),
});

const CreateBody = Type.Object({
  type: CashFlowKind,
  gross_amount: Amount,
  withholding_tax: Type.Optional(Amount),
  fee: Type.Optional(Amount),
  currency: Type.String({ minLength: 3, maxLength: 3 }),
  payment_date: DateStr,
  tax_relevant_value_date: Type.Optional(DateStr),
  position_id: Type.Optional(Type.String({ format: 'uuid' })),
  note: Type.Optional(Type.String({ maxLength: 280 })),
});

const UpdateBody = Type.Object({
  gross_amount: Type.Optional(Amount),
  withholding_tax: Type.Optional(Amount),
  fee: Type.Optional(Amount),
  currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
  payment_date: Type.Optional(DateStr),
  tax_relevant_value_date: Type.Optional(DateStr),
  note: Type.Optional(Type.Union([Type.String({ maxLength: 280 }), Type.Null()])),
});

export interface CashFlowRouteDeps {
  service: CashFlowService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/** Cash-flow endpoints, nested under a portfolio. Reads need `portfolio:read`; writes `portfolio:write`. */
export function registerCashFlowRoutes(app: FastifyInstance, deps: CashFlowRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];
  const write = [deps.authenticate, deps.requireScope('portfolio:write')];

  r.get(
    '/portfolios/:portfolioId/cash-flows',
    { preHandler: read, schema: { querystring: ListQuery } },
    async (request) =>
      deps.service.list(uid(request.user?.sub), (request.params as { portfolioId: string }).portfolioId, {
        type: request.query.type as CashFlowType | undefined,
        positionId: request.query.position_id,
      }),
  );

  r.post(
    '/portfolios/:portfolioId/cash-flows',
    { preHandler: write, schema: { body: CreateBody } },
    async (request, reply) => {
      const created = await deps.service.create(
        uid(request.user?.sub),
        (request.params as { portfolioId: string }).portfolioId,
        {
          type: request.body.type,
          grossAmount: request.body.gross_amount,
          withholdingTax: request.body.withholding_tax,
          fee: request.body.fee,
          currency: request.body.currency,
          paymentDate: request.body.payment_date,
          taxRelevantValueDate: request.body.tax_relevant_value_date,
          positionId: request.body.position_id ?? null,
          note: request.body.note ?? null,
        },
      );
      reply.code(201);
      return created;
    },
  );

  r.patch(
    '/portfolios/:portfolioId/cash-flows/:id',
    { preHandler: write, schema: { body: UpdateBody } },
    async (request) =>
      deps.service.update(uid(request.user?.sub), (request.params as { id: string }).id, {
        grossAmount: request.body.gross_amount,
        withholdingTax: request.body.withholding_tax,
        fee: request.body.fee,
        currency: request.body.currency,
        paymentDate: request.body.payment_date,
        taxRelevantValueDate: request.body.tax_relevant_value_date,
        note: request.body.note,
      }),
  );

  r.delete('/portfolios/:portfolioId/cash-flows/:id', { preHandler: write }, async (request) => {
    await deps.service.delete(uid(request.user?.sub), (request.params as { id: string }).id);
    return { ok: true };
  });
}

function uid(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}
