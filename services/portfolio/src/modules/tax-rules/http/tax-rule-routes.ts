import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { TaxRuleService } from '../application/tax-rule-service.js';
import { TaxRuleSchema } from '../../../schemas.js';

const ListQuery = Type.Object({
  country: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
  asset_class: Type.Optional(Type.String({ maxLength: 32 })),
  on: Type.Optional(Type.String({ format: 'date' })),
});

export interface TaxRuleRouteDeps {
  service: TaxRuleService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * Tax-rules registry reads. The frontend calls this with the user's tax residence
 * and an asset class to obtain the matching rule(s) and their settings schemas to
 * render the configuration UI. Global reference data, but still gated by
 * `portfolio:read` like other portfolio-service reads.
 */
export function registerTaxRuleRoutes(app: FastifyInstance, deps: TaxRuleRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];

  r.get('/tax-rules', { preHandler: read, schema: { querystring: ListQuery, response: { 200: Type.Array(TaxRuleSchema) } } }, async (request) =>
    deps.service.find({
      countryCode: request.query.country,
      assetClass: request.query.asset_class,
      on: request.query.on,
    }),
  );
}
