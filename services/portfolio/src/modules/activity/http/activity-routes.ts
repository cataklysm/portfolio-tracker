import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { ActivityService } from '../application/activity-service.js';
import type { ActivityKind } from '../application/ports.js';

const ListQuery = Type.Object({
  portfolio_id: Type.Optional(Type.String({ format: 'uuid' })),
  type: Type.Optional(
    Type.Union([
      Type.Literal('trade'),
      Type.Literal('cash_flow'),
      Type.Literal('tax_event'),
      Type.Literal('corporate_action'),
      Type.Literal('transfer'),
    ]),
  ),
  cursor: Type.Optional(Type.String({ minLength: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});

export interface ActivityRouteDeps {
  service: ActivityService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * The cross-portfolio activity feed: one chronological, keyset-paginated stream
 * of trades, cash flows, tax events, applied corporate actions, and position
 * transfers. Read needs `portfolio:read`.
 */
export function registerActivityRoutes(app: FastifyInstance, deps: ActivityRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];

  r.get('/activity', { preHandler: read, schema: { querystring: ListQuery } }, async (request) =>
    deps.service.list(uid(request.user?.sub), {
      portfolioId: request.query.portfolio_id,
      kind: request.query.type as ActivityKind | undefined,
      cursor: request.query.cursor,
      limit: request.query.limit,
    }),
  );
}

function uid(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}
