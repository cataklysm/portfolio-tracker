import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { WatchlistService } from '../application/watchlist-service.js';
import { WatchlistItemViewSchema, OkResponse } from '../../../schemas.js';

const AddWatchlistBody = Type.Object({
  listing_id: Type.String({ format: 'uuid' }),
  note: Type.Optional(Type.String({ maxLength: 500 })),
});

export interface WatchlistRouteDeps {
  service: WatchlistService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/** Watchlist endpoints. Reads need `portfolio:read`; writes `portfolio:write`. */
export function registerWatchlistRoutes(app: FastifyInstance, deps: WatchlistRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];
  const write = [deps.authenticate, deps.requireScope('portfolio:write')];

  r.get('/watchlist', { preHandler: read, schema: { response: { 200: Type.Array(WatchlistItemViewSchema) } } }, async (request) =>
    deps.service.list(uid(request.user?.sub), bearer(request.headers.authorization)),
  );

  r.post('/watchlist', { preHandler: write, schema: { body: AddWatchlistBody, response: { 201: Type.Object({ id: Type.String() }) } } }, async (request, reply) => {
    const result = await deps.service.add(uid(request.user?.sub), request.body.listing_id, request.body.note ?? null);
    reply.code(201);
    return result;
  });

  r.delete('/watchlist/:listingId', { preHandler: write, schema: { response: { 200: OkResponse } } }, async (request) => {
    await deps.service.remove(uid(request.user?.sub), (request.params as { listingId: string }).listingId);
    return { ok: true as const };
  });
}

function uid(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}

/** The verified bearer token, forwarded on cross-service reads (listings, quotes). */
function bearer(header: string | undefined): string {
  if (!header || !header.startsWith('Bearer ')) {
    throw AppError.unauthorized('missing_bearer_token', 'A bearer token is required');
  }
  return header.slice('Bearer '.length);
}
