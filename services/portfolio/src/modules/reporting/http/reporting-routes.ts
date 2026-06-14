import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { ReportingService } from '../application/reporting-service.js';

const ScopeQuery = Type.Object({ portfolio_id: Type.Optional(Type.String({ format: 'uuid' })) });

export interface ReportingRouteDeps {
  service: ReportingService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * Authoritative reporting reads. `portfolio_id` selects one portfolio; omitting
 * it reports the combined active set. Both need `portfolio:read`.
 */
export function registerReportingRoutes(app: FastifyInstance, deps: ReportingRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];

  r.get('/reporting/summary', { preHandler: read, schema: { querystring: ScopeQuery } }, async (request) =>
    deps.service.getSummary(uid(request.user?.sub), bearer(request.headers.authorization), request.query.portfolio_id),
  );

  r.get('/reporting/holdings', { preHandler: read, schema: { querystring: ScopeQuery } }, async (request) =>
    deps.service.getHoldings(uid(request.user?.sub), bearer(request.headers.authorization), request.query.portfolio_id),
  );

  r.get('/reporting/allocation', { preHandler: read, schema: { querystring: ScopeQuery } }, async (request) =>
    deps.service.getAllocation(uid(request.user?.sub), bearer(request.headers.authorization), request.query.portfolio_id),
  );
}

function uid(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}

function bearer(header: string | undefined): string {
  if (!header || !header.startsWith('Bearer ')) {
    throw AppError.unauthorized('missing_bearer_token', 'A bearer token is required');
  }
  return header.slice(7);
}
