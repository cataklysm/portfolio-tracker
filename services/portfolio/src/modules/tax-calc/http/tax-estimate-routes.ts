import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { TaxEstimateService } from '../application/tax-estimate-service.js';

const ScopeQuery = Type.Object({ portfolio_id: Type.Optional(Type.String({ format: 'uuid' })) });

export interface TaxEstimateRouteDeps {
  service: TaxEstimateService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * The tax ESTIMATE read (securities + crypto), separate from the recorded-tax
 * report at `GET /reporting/tax`. `portfolio_id` selects one portfolio; omitting
 * it covers the combined active set. Needs `portfolio:read`.
 */
export function registerTaxEstimateRoutes(app: FastifyInstance, deps: TaxEstimateRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];

  r.get('/reporting/tax/estimate', { preHandler: read, schema: { querystring: ScopeQuery } }, async (request) =>
    deps.service.getEstimate(uid(request.user?.sub), bearer(request.headers.authorization), request.query.portfolio_id),
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
