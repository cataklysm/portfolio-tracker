import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { NotificationService } from '../application/notification-service.js';
import type { RuleService } from '../application/rule-service.js';

const ListQuery = Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) });

const RuleKind = Type.Union([
  Type.Literal('price_threshold'),
  Type.Literal('daily_move'),
  Type.Literal('earnings_lead'),
  Type.Literal('cost_basis_move'),
  Type.Literal('target_zone'),
]);

const CreateRuleBody = Type.Object({
  kind: RuleKind,
  scope: Type.Union([Type.Literal('instrument'), Type.Literal('all_holdings')]),
  instrument_id: Type.Optional(Type.String({ format: 'uuid' })),
  listing_id: Type.Optional(Type.String({ format: 'uuid' })),
  params: Type.Record(Type.String(), Type.Unknown()),
  label: Type.Optional(Type.String({ maxLength: 100 })),
});

const UpdateRuleBody = Type.Object({
  params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  label: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  enabled: Type.Optional(Type.Boolean()),
});

export interface NotificationRouteDeps {
  service: NotificationService;
  rules: RuleService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

function uid(request: FastifyRequest): string {
  const sub = request.user?.sub;
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}

/**
 * A user's notification inbox + their alert rules. Reading needs
 * `notifications:read`; creating/editing rules needs `notifications:write`.
 */
export function registerNotificationRoutes(app: FastifyInstance, deps: NotificationRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('notifications:read')];
  const write = [deps.authenticate, deps.requireScope('notifications:write')];

  // ---- Inbox --------------------------------------------------------------
  r.get('/notifications', { preHandler: read, schema: { querystring: ListQuery } }, async (request) =>
    deps.service.getInbox(uid(request), request.query.limit),
  );
  r.post('/notifications/:id/read', { preHandler: read }, async (request) => {
    await deps.service.markRead(uid(request), (request.params as { id: string }).id);
    return { ok: true };
  });
  r.post('/notifications/read-all', { preHandler: read }, async (request) => {
    const marked = await deps.service.markAllRead(uid(request));
    return { marked };
  });

  // ---- Alert rules (incl. the pre-seeded default alerts) ------------------
  r.get('/notifications/rules', { preHandler: read }, async (request) => deps.rules.list(uid(request)));

  r.post('/notifications/rules', { preHandler: write, schema: { body: CreateRuleBody } }, async (request, reply) => {
    const rule = await deps.rules.create(uid(request), {
      kind: request.body.kind,
      scope: request.body.scope,
      instrumentId: request.body.instrument_id ?? null,
      listingId: request.body.listing_id ?? null,
      params: request.body.params,
      label: request.body.label ?? null,
    });
    reply.code(201);
    return rule;
  });

  r.patch('/notifications/rules/:id', { preHandler: write, schema: { body: UpdateRuleBody } }, async (request) =>
    deps.rules.update(uid(request), (request.params as { id: string }).id, {
      params: request.body.params,
      label: request.body.label,
      enabled: request.body.enabled,
    }),
  );

  r.delete('/notifications/rules/:id', { preHandler: write }, async (request) => {
    await deps.rules.delete(uid(request), (request.params as { id: string }).id);
    return { ok: true };
  });
}
