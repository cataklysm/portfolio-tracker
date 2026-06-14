import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { TaxResidencyService } from '../application/tax-residency-service.js';

const SetBody = Type.Object({
  country_code: Type.String({ minLength: 2, maxLength: 2 }),
  valid_from: Type.String({ format: 'date' }),
  is_primary: Type.Optional(Type.Boolean()),
});

export interface TaxResidencyRouteDeps {
  service: TaxResidencyService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * The user's own tax residence. Read needs `profile:read`; recording a new
 * effective-dated residence needs `profile:write`. Public through the gateway.
 */
export function registerTaxResidencyRoutes(app: FastifyInstance, deps: TaxResidencyRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();

  r.get(
    '/tax-residency',
    { preHandler: [deps.authenticate, deps.requireScope('profile:read')] },
    async (request) => deps.service.get(uid(request.user?.sub)),
  );

  r.post(
    '/tax-residency',
    { preHandler: [deps.authenticate, deps.requireScope('profile:write')], schema: { body: SetBody } },
    async (request, reply) => {
      const view = await deps.service.set(uid(request.user?.sub), {
        countryCode: request.body.country_code,
        validFrom: request.body.valid_from,
        isPrimary: request.body.is_primary,
      });
      reply.code(201);
      return view;
    },
  );
}

function uid(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}
