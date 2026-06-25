import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError, HIDE_FROM_OPENAPI } from '@portfolio/platform';
import type { NotificationService } from '../application/notification-service.js';
import type { RuleService } from '../application/rule-service.js';
import type { PushSubscriptionRepository } from '../application/ports.js';
import type { LiveNotificationHub } from '../live-notifications.js';

const ListQuery = Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) });

const RuleKind = Type.Union([
  Type.Literal('price_threshold'),
  Type.Literal('daily_move'),
  Type.Literal('earnings_lead'),
  Type.Literal('cost_basis_move'),
  Type.Literal('target_zone'),
]);

const RulesQuery = Type.Object({
  // Optional filters scoping the list to one instrument and/or listing.
  instrument_id: Type.Optional(Type.String({ format: 'uuid' })),
  listing_id: Type.Optional(Type.String({ format: 'uuid' })),
});

const CreateRuleBody = Type.Object({
  kind: RuleKind,
  // Rules are always instrument-scoped; an instrument is required.
  instrument_id: Type.String({ format: 'uuid' }),
  listing_id: Type.Optional(Type.String({ format: 'uuid' })),
  params: Type.Record(Type.String(), Type.Unknown()),
  label: Type.Optional(Type.String({ maxLength: 100 })),
  // Defaults to true (fire once then disable); set false for a recurring alert.
  notify_once: Type.Optional(Type.Boolean()),
  // "Remind me later" cooldown in minutes (5..1440) for recurring rules; null = none.
  remind_after_minutes: Type.Optional(Type.Union([Type.Integer({ minimum: 5, maximum: 1440 }), Type.Null()])),
});

const UpdateRuleBody = Type.Object({
  params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  label: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  enabled: Type.Optional(Type.Boolean()),
  notify_once: Type.Optional(Type.Boolean()),
  remind_after_minutes: Type.Optional(Type.Union([Type.Integer({ minimum: 5, maximum: 1440 }), Type.Null()])),
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
  rule_id: Type.Union([Type.String(), Type.Null()]),
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
  instrument_id: Type.String(),
  listing_id: Type.Union([Type.String(), Type.Null()]),
  params: Type.Record(Type.String(), Type.Unknown()),
  label: Type.Union([Type.String(), Type.Null()]),
  enabled: Type.Boolean(),
  notify_once: Type.Boolean(),
  remind_after_minutes: Type.Union([Type.Integer(), Type.Null()]),
  created_at: Type.String(),
  updated_at: Type.String(),
});

const OkResponse = Type.Object({ ok: Type.Literal(true) });
const MarkedResponse = Type.Object({ marked: Type.Integer() });

const PublicKeyResponse = Type.Object({ public_key: Type.Union([Type.String(), Type.Null()]) });
const PushSubscriptionBody = Type.Object({
  endpoint: Type.String({ minLength: 1, maxLength: 2000 }),
  keys: Type.Object({
    p256dh: Type.String({ minLength: 1, maxLength: 255 }),
    auth: Type.String({ minLength: 1, maxLength: 255 }),
  }),
  user_agent: Type.Optional(Type.String({ maxLength: 400 })),
});
const DeletePushBody = Type.Object({ endpoint: Type.String({ minLength: 1, maxLength: 2000 }) });

export interface NotificationRouteDeps {
  service: NotificationService;
  rules: RuleService;
  live?: LiveNotificationHub;
  /** Web Push: the VAPID public key (or null when unconfigured) + subscription store. */
  push?: { publicKey: string | null; subscriptions: PushSubscriptionRepository };
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
  r.get('/notifications/stream', { preHandler: read, schema: HIDE_FROM_OPENAPI }, async (request, reply) => {
    if (!deps.live) {
      throw new AppError({
        status: 503,
        code: 'live_notifications_unavailable',
        title: 'Service Unavailable',
        detail: 'Live notifications are unavailable',
      });
    }
    const userId = uid(request);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const unsubscribe = deps.live.subscribe(userId, (notification) => {
      reply.raw.write(`id: ${notification.id}\n`);
      reply.raw.write('event: notification.created\n');
      reply.raw.write(`data: ${JSON.stringify(notification)}\n\n`);
    });
    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 25_000);
    if (typeof heartbeat.unref === 'function') heartbeat.unref();

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
  r.post('/notifications/:id/read', { preHandler: read, schema: { response: { 200: OkResponse } } }, async (request) => {
    await deps.service.markRead(uid(request), (request.params as { id: string }).id);
    return { ok: true as const };
  });
  r.post('/notifications/read-all', { preHandler: read, schema: { response: { 200: MarkedResponse } } }, async (request) => {
    const marked = await deps.service.markAllRead(uid(request));
    return { marked };
  });

  // ---- Alert rules (user-defined, instrument-scoped) ----------------------
  r.get('/notifications/rules', { preHandler: read, schema: { querystring: RulesQuery, response: { 200: Type.Array(AlertRuleSchema) } } }, async (request) =>
    deps.rules.list(uid(request), { instrumentId: request.query.instrument_id, listingId: request.query.listing_id }),
  );

  r.post('/notifications/rules', { preHandler: write, schema: { body: CreateRuleBody, response: { 201: AlertRuleSchema } } }, async (request, reply) => {
    const rule = await deps.rules.create(uid(request), {
      kind: request.body.kind,
      instrumentId: request.body.instrument_id,
      listingId: request.body.listing_id ?? null,
      params: request.body.params,
      label: request.body.label ?? null,
      notifyOnce: request.body.notify_once,
      remindAfterMinutes: request.body.remind_after_minutes ?? null,
    });
    reply.code(201);
    return rule;
  });

  r.patch('/notifications/rules/:id', { preHandler: write, schema: { body: UpdateRuleBody, response: { 200: AlertRuleSchema } } }, async (request) =>
    deps.rules.update(uid(request), (request.params as { id: string }).id, {
      params: request.body.params,
      label: request.body.label,
      enabled: request.body.enabled,
      notifyOnce: request.body.notify_once,
      remindAfterMinutes: request.body.remind_after_minutes,
    }),
  );

  r.delete('/notifications/rules/:id', { preHandler: write, schema: { response: { 200: OkResponse } } }, async (request) => {
    await deps.rules.delete(uid(request), (request.params as { id: string }).id);
    return { ok: true as const };
  });

  // ---- Web Push subscriptions (desktop notifications) ---------------------
  // The VAPID public key the client passes to PushManager.subscribe(); null when
  // push is not configured (the client should then skip registration).
  r.get('/notifications/push/public-key', { preHandler: read, schema: { response: { 200: PublicKeyResponse } } }, async () => ({
    public_key: deps.push?.publicKey ?? null,
  }));

  // Register (or refresh) this client's push subscription for the user.
  r.post('/notifications/push/subscriptions', { preHandler: write, schema: { body: PushSubscriptionBody, response: { 201: OkResponse } } }, async (request, reply) => {
    if (!deps.push) throw AppError.badRequest('push_unavailable', 'Push notifications are not configured');
    await deps.push.subscriptions.upsert({
      userId: uid(request),
      endpoint: request.body.endpoint,
      p256dh: request.body.keys.p256dh,
      auth: request.body.keys.auth,
      userAgent: request.body.user_agent ?? null,
    });
    reply.code(201);
    return { ok: true as const };
  });

  // Remove this client's push subscription (e.g. the user disables desktop alerts).
  r.delete('/notifications/push/subscriptions', { preHandler: write, schema: { body: DeletePushBody, response: { 200: OkResponse } } }, async (request) => {
    if (!deps.push) throw AppError.badRequest('push_unavailable', 'Push notifications are not configured');
    await deps.push.subscriptions.deleteByEndpoint(uid(request), request.body.endpoint);
    return { ok: true as const };
  });
}
