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

const StoredNotificationSchema = Type.Object({
  id: Type.String(),
  type: Type.Union([
    Type.Literal('daily_move'),
    Type.Literal('earnings_upcoming'),
    Type.Literal('target_zone'),
    Type.Literal('price_threshold'),
    Type.Literal('cost_basis_move'),
  ]),
  severity: Type.Union([Type.Literal('info'), Type.Literal('warning'), Type.Literal('critical')]),
  title: Type.String(),
  body: Type.Union([Type.String(), Type.Null()]),
  instrument_id: Type.Union([Type.String(), Type.Null()]),
  listing_id: Type.Union([Type.String(), Type.Null()]),
  data: Type.Unknown(),
  read_at: Type.Union([Type.String(), Type.Null()]),
  created_at: Type.String(),
});

const InboxSchema = Type.Object({
  unread_count: Type.Integer(),
  notifications: Type.Array(StoredNotificationSchema),
});

const AlertRuleSchema = Type.Object({
  id: Type.String(),
  user_id: Type.String(),
  kind: RuleKind,
  scope: Type.Union([Type.Literal('instrument'), Type.Literal('all_holdings')]),
  instrument_id: Type.Union([Type.String(), Type.Null()]),
  listing_id: Type.Union([Type.String(), Type.Null()]),
  params: Type.Record(Type.String(), Type.Unknown()),
  label: Type.Union([Type.String(), Type.Null()]),
  enabled: Type.Boolean(),
  created_at: Type.String(),
  updated_at: Type.String(),
});

const OkResponse = Type.Object({ ok: Type.Literal(true) });
const MarkedResponse = Type.Object({ marked: Type.Integer() });

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
  r.get('/notifications', { preHandler: read, schema: { querystring: ListQuery, response: { 200: InboxSchema } } }, async (request) =>
    deps.service.getInbox(uid(request), request.query.limit),
  );
  r.post('/notifications/:id/read', { preHandler: read, schema: { response: { 200: OkResponse } } }, async (request) => {
    await deps.service.markRead(uid(request), (request.params as { id: string }).id);
    return { ok: true as const };
  });
  r.post('/notifications/read-all', { preHandler: read, schema: { response: { 200: MarkedResponse } } }, async (request) => {
    const marked = await deps.service.markAllRead(uid(request));
    return { marked };
  });

  // ---- Alert rules (incl. the pre-seeded default alerts) ------------------
  r.get('/notifications/rules', { preHandler: read, schema: { response: { 200: Type.Array(AlertRuleSchema) } } }, async (request) => deps.rules.list(uid(request)));

  r.post('/notifications/rules', { preHandler: write, schema: { body: CreateRuleBody, response: { 201: AlertRuleSchema } } }, async (request, reply) => {
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

  r.patch('/notifications/rules/:id', { preHandler: write, schema: { body: UpdateRuleBody, response: { 200: AlertRuleSchema } } }, async (request) =>
    deps.rules.update(uid(request), (request.params as { id: string }).id, {
      params: request.body.params,
      label: request.body.label,
      enabled: request.body.enabled,
    }),
  );

  r.delete('/notifications/rules/:id', { preHandler: write, schema: { response: { 200: OkResponse } } }, async (request) => {
    await deps.rules.delete(uid(request), (request.params as { id: string }).id);
    return { ok: true as const };
  });
}
