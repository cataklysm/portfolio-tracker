import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { PositionService } from '../application/position-service.js';
import type { NewTransaction } from '../application/ports.js';

const Decimalish = Type.String({ pattern: '^[0-9]+(\\.[0-9]+)?$' });

const TransactionBody = Type.Object({
  side: Type.Union([Type.Literal('buy'), Type.Literal('sell')]),
  quantity: Decimalish,
  price: Decimalish,
  fee: Type.Optional(Decimalish),
  currency: Type.String({ minLength: 3, maxLength: 3 }),
  effective_at: Type.String({ format: 'date-time' }),
  tax_relevant_value_date: Type.Optional(Type.String({ format: 'date' })),
  booking_fx_rate: Type.Optional(Decimalish),
  savings_plan: Type.Optional(Type.Boolean()),
  note: Type.Optional(Type.String({ maxLength: 500 })),
});

const CreatePositionBody = Type.Object({
  portfolio_id: Type.String({ format: 'uuid' }),
  listing_id: Type.String({ format: 'uuid' }),
  transaction: TransactionBody,
});

const ListPositionsQuery = Type.Object({
  portfolio_id: Type.Optional(Type.String({ format: 'uuid' })),
});

type TransactionBodyType = Static<typeof TransactionBody>;

function toNewTransaction(body: TransactionBodyType): NewTransaction {
  const effectiveAt = new Date(body.effective_at);
  const taxDate = body.tax_relevant_value_date ?? body.effective_at.slice(0, 10);
  return {
    side: body.side,
    quantity: body.quantity,
    price: body.price,
    fee: body.fee ?? '0',
    currency: body.currency.toUpperCase(),
    effectiveAt,
    taxRelevantValueDate: taxDate,
    bookingFxRate: body.booking_fx_rate ?? null,
    savingsPlan: body.savings_plan ?? false,
    note: body.note ?? null,
  };
}

export interface PositionRouteDeps {
  service: PositionService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * Position and transaction endpoints. Reads require `portfolio:read`; writes
 * require `portfolio:write`. Ownership is enforced in the repository through the
 * portfolio's user id, never from the request body.
 */
export function registerPositionRoutes(app: FastifyInstance, deps: PositionRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];
  const write = [deps.authenticate, deps.requireScope('portfolio:write')];

  r.get('/positions', { preHandler: read, schema: { querystring: ListPositionsQuery } }, async (request) =>
    deps.service.listPositions(userId(request.user?.sub), bearer(request.headers.authorization), request.query.portfolio_id),
  );

  r.get('/positions/:id', { preHandler: read }, async (request) => {
    const { id } = request.params as { id: string };
    return deps.service.getPosition(userId(request.user?.sub), bearer(request.headers.authorization), id);
  });

  r.post('/positions', { preHandler: write, schema: { body: CreatePositionBody } }, async (request, reply) => {
    const result = await deps.service.createPosition(userId(request.user?.sub), bearer(request.headers.authorization), {
      portfolioId: request.body.portfolio_id,
      listingId: request.body.listing_id,
      transaction: toNewTransaction(request.body.transaction),
    });
    reply.code(201);
    return result;
  });

  r.post(
    '/positions/:id/transactions',
    { preHandler: write, schema: { body: TransactionBody } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await deps.service.addTransaction(
        userId(request.user?.sub),
        bearer(request.headers.authorization),
        id,
        toNewTransaction(request.body),
      );
      reply.code(201);
      return result;
    },
  );

  r.patch(
    '/positions/:id/transactions/:txId',
    { preHandler: write, schema: { body: TransactionBody } },
    async (request) => {
      const { id, txId } = request.params as { id: string; txId: string };
      return deps.service.updateTransaction(
        userId(request.user?.sub),
        bearer(request.headers.authorization),
        id,
        txId,
        toNewTransaction(request.body),
      );
    },
  );

  r.delete('/positions/:id/transactions/:txId', { preHandler: write }, async (request) => {
    const { id, txId } = request.params as { id: string; txId: string };
    await deps.service.deleteTransaction(
      userId(request.user?.sub),
      bearer(request.headers.authorization),
      id,
      txId,
    );
    return { ok: true };
  });

  r.delete('/positions/:id', { preHandler: write }, async (request) => {
    const { id } = request.params as { id: string };
    await deps.service.deletePosition(userId(request.user?.sub), id);
    return { ok: true };
  });
}

function userId(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}

/** The verified bearer token, forwarded on cross-service reads to instruments. */
function bearer(header: string | undefined): string {
  if (!header || !header.startsWith('Bearer ')) {
    throw AppError.unauthorized('missing_bearer_token', 'A bearer token is required');
  }
  return header.slice(7);
}
