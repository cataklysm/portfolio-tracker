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

const Ns = Type.Union([Type.String(), Type.Null()]);

const UserProfileSchema = Type.Object({
  id: Type.String(),
  email: Type.String(),
  display_name: Ns,
  role: Type.Union([Type.Literal('user'), Type.Literal('admin')]),
  preferences: Type.Object({
    reporting_currency: Type.String(),
    realization_accounting_method: AccountingMethod,
    combined_headline_metric: Type.String(),
    combined_benchmark: Ns,
    avatar_color: Type.String(),
    locale: Ns,
    timezone: Ns,
  }),
  tax_residence: Type.Union([
    Type.Object({ country_code: Type.String(), valid_from: Type.String() }),
    Type.Null(),
  ]),
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
    { preHandler: [deps.authenticate, deps.requireScope('profile:read')], schema: { response: { 200: UserProfileSchema } } },
    async (request) => deps.service.getProfile(requireUserId(request.user?.sub)),
  );

  r.patch(
    '/me/preferences',
    {
      preHandler: [deps.authenticate, deps.requireScope('profile:write')],
      schema: { body: UpdateProfileBody, response: { 200: UserProfileSchema } },
    },
    async (request) => deps.service.updateProfile(requireUserId(request.user?.sub), request.body),
  );
}

function requireUserId(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}
