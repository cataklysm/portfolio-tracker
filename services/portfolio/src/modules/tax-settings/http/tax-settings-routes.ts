import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { TaxSettingsService } from '../application/tax-settings-service.js';
import { UserTaxSettingsSchema, PortfolioTaxSettingsSchema } from '../../../schemas.js';

// Settings payloads are validated against the rule's JSON schema in the service;
// the HTTP schema only constrains the envelope (the values are free-form JSON).
const Settings = Type.Record(Type.String(), Type.Unknown());

const SetUserBody = Type.Object({
  country: Type.String({ minLength: 2, maxLength: 2 }),
  settings: Settings,
});

const SetPortfolioBody = Type.Object({
  rule_key: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
  settings: Settings,
});

export interface TaxSettingsRouteDeps {
  service: TaxSettingsService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * Saved tax settings (user-level and per-portfolio). Reads need `portfolio:read`;
 * writes `portfolio:write`. Values are validated against the matching tax rule's
 * schema before they are stored.
 */
export function registerTaxSettingsRoutes(app: FastifyInstance, deps: TaxSettingsRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];
  const write = [deps.authenticate, deps.requireScope('portfolio:write')];

  r.get('/tax-settings', { preHandler: read, schema: { response: { 200: Type.Union([UserTaxSettingsSchema, Type.Null()]) } } }, async (request) =>
    deps.service.getUserSettings(uid(request.user?.sub)),
  );

  r.put('/tax-settings', { preHandler: write, schema: { body: SetUserBody, response: { 200: UserTaxSettingsSchema } } }, async (request) =>
    deps.service.setUserSettings(uid(request.user?.sub), {
      countryCode: request.body.country,
      settings: request.body.settings,
    }),
  );

  r.get('/portfolios/:id/tax-settings', { preHandler: read, schema: { response: { 200: PortfolioTaxSettingsSchema } } }, async (request) =>
    deps.service.getPortfolioSettings(uid(request.user?.sub), (request.params as { id: string }).id),
  );

  r.put(
    '/portfolios/:id/tax-settings',
    { preHandler: write, schema: { body: SetPortfolioBody, response: { 200: PortfolioTaxSettingsSchema } } },
    async (request) =>
      deps.service.setPortfolioSettings(uid(request.user?.sub), (request.params as { id: string }).id, {
        ruleKey: request.body.rule_key,
        settings: request.body.settings,
      }),
  );
}

function uid(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}
