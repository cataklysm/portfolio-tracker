import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { ChangeEntityType, ChangeLogReader } from '../application/ports.js';
import { BookingChangeSchema } from '../../../schemas.js';

const EntityType = Type.Union([
  Type.Literal('transaction'),
  Type.Literal('cash_flow'),
  Type.Literal('tax_event'),
]);

const ListQuery = Type.Object({
  entity_type: Type.Optional(EntityType),
  entity_id: Type.Optional(Type.String({ format: 'uuid' })),
  portfolio_id: Type.Optional(Type.String({ format: 'uuid' })),
});

export interface ChangeLogRouteDeps {
  reader: ChangeLogReader;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/** The user's immutable booking-change history. Read needs `portfolio:read`. */
export function registerChangeLogRoutes(app: FastifyInstance, deps: ChangeLogRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];

  r.get('/changes', { preHandler: read, schema: { querystring: ListQuery, response: { 200: Type.Array(BookingChangeSchema) } } }, async (request) =>
    deps.reader.list(uid(request.user?.sub), {
      entityType: request.query.entity_type as ChangeEntityType | undefined,
      entityId: request.query.entity_id,
      portfolioId: request.query.portfolio_id,
    }),
  );
}

function uid(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}
