import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { CorporateActionService } from '../application/corporate-action-service.js';
import {
  CorporateActionApplicationRecordSchema,
  ApplyCorporateActionResultSchema,
  ReverseCorporateActionResultSchema,
} from '../../../schemas.js';

const Decimalish = Type.String({ pattern: '^[0-9]+(\\.[0-9]+)?$' });

const ApplyBody = Type.Object({
  corporate_action_id: Type.String({ minLength: 1, maxLength: 200 }),
  type: Type.Union([Type.Literal('split'), Type.Literal('reverse_split')]),
  ratio_numerator: Decimalish,
  ratio_denominator: Decimalish,
  ex_date: Type.String({ format: 'date' }),
  version: Type.Optional(Type.Integer({ minimum: 1 })),
  fractional_handling: Type.Optional(
    Type.Union([Type.Literal('keep_fractional'), Type.Literal('cash_settlement')]),
  ),
});

const ReverseBody = Type.Object({
  reason: Type.Optional(Type.String({ maxLength: 500 })),
});

export interface CorporateActionRouteDeps {
  service: CorporateActionService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * Corporate-action apply/reverse for a position. Reads need `portfolio:read`;
 * applying/reversing needs `portfolio:write`. Ownership is enforced through the
 * position's portfolio, never from the body.
 */
export function registerCorporateActionRoutes(app: FastifyInstance, deps: CorporateActionRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];
  const write = [deps.authenticate, deps.requireScope('portfolio:write')];

  r.get('/positions/:id/corporate-actions', { preHandler: read, schema: { response: { 200: Type.Array(CorporateActionApplicationRecordSchema) } } }, async (request) => {
    const { id } = request.params as { id: string };
    return deps.service.list(uid(request.user?.sub), id);
  });

  r.post('/positions/:id/corporate-actions', { preHandler: write, schema: { body: ApplyBody, response: { 201: ApplyCorporateActionResultSchema } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await deps.service.apply(uid(request.user?.sub), bearer(request.headers.authorization), id, {
      corporateActionId: request.body.corporate_action_id,
      type: request.body.type,
      ratioNumerator: request.body.ratio_numerator,
      ratioDenominator: request.body.ratio_denominator,
      exDate: request.body.ex_date,
      version: request.body.version,
      fractionalHandling: request.body.fractional_handling,
    });
    reply.code(201);
    return result;
  });

  r.post('/corporate-actions/:applicationId/reverse', { preHandler: write, schema: { body: ReverseBody, response: { 200: ReverseCorporateActionResultSchema } } }, async (request) => {
    const { applicationId } = request.params as { applicationId: string };
    return deps.service.reverse(
      uid(request.user?.sub),
      bearer(request.headers.authorization),
      applicationId,
      request.body.reason ?? null,
    );
  });
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
