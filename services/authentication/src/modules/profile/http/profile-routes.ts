import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { ProfileService } from '../application/profile-service.js';

const ReportingCurrency = Type.String({ minLength: 3, maxLength: 3 });
const AccountingMethod = Type.Union([
  Type.Literal('fifo'),
  Type.Literal('lifo'),
  Type.Literal('average_cost'),
]);

const UpdateProfileBody = Type.Object({
  display_name: Type.Optional(Type.String({ maxLength: 200 })),
  reporting_currency: Type.Optional(ReportingCurrency),
  realization_accounting_method: Type.Optional(AccountingMethod),
  combined_headline_metric: Type.Optional(Type.String({ maxLength: 64 })),
  combined_benchmark: Type.Optional(Type.Union([Type.String({ format: 'uuid' }), Type.Null()])),
  avatar_color: Type.Optional(Type.String({ maxLength: 32 })),
  locale: Type.Optional(Type.Union([Type.String({ maxLength: 32 }), Type.Null()])),
  timezone: Type.Optional(Type.Union([Type.String({ maxLength: 64 }), Type.Null()])),
});

export interface ProfileRouteDeps {
  service: ProfileService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * The authenticated user's own profile. GET requires `profile:read`; updates
 * require `profile:write`. Public through the gateway.
 */
export function registerProfileRoutes(app: FastifyInstance, deps: ProfileRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();

  r.get(
    '/me',
    { preHandler: [deps.authenticate, deps.requireScope('profile:read')] },
    async (request) => deps.service.getProfile(requireUserId(request.user?.sub)),
  );

  r.patch(
    '/me/preferences',
    {
      preHandler: [deps.authenticate, deps.requireScope('profile:write')],
      schema: { body: UpdateProfileBody },
    },
    async (request) => deps.service.updateProfile(requireUserId(request.user?.sub), request.body),
  );
}

function requireUserId(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}
