import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { AppError, HIDE_FROM_OPENAPI } from '@portfolio/platform';
import type { LiveQuoteHub } from '../application/live-quote-hub.js';

export interface LiveQuoteRouteDeps {
  /** Present only when the live-quotes feature is enabled. */
  hub?: LiveQuoteHub;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

function userId(request: FastifyRequest): string {
  const sub = request.user?.sub;
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}

/**
 * Server-Sent Events stream that pings the authenticated user whenever quotes for
 * any of their open positions are refreshed. Each message carries only the
 * affected listing ids (+ as_of), so the client refetches just those quotes
 * instead of polling or reloading. Requires `portfolio:read`. Hidden from OpenAPI
 * (an SSE stream, not a JSON endpoint).
 *
 * Note: browsers' EventSource cannot set an Authorization header, so the web
 * proxies this endpoint server-side with the user's token (as it already does for
 * the notifications stream).
 */
export function registerLiveQuoteRoutes(app: FastifyInstance, deps: LiveQuoteRouteDeps): void {
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];

  app.get('/positions/stream', { preHandler: read, schema: HIDE_FROM_OPENAPI }, async (request, reply) => {
    if (!deps.hub) {
      throw new AppError({
        status: 503,
        code: 'live_quotes_unavailable',
        title: 'Service Unavailable',
        detail: 'Live position updates are unavailable',
      });
    }
    const uid = userId(request);

    // Take over the socket and stream SSE frames directly on the raw response.
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const unsubscribe = deps.hub.subscribe(uid, (update) => {
      reply.raw.write('event: quotes.updated\n');
      reply.raw.write(`data: ${JSON.stringify({ listing_ids: update.listingIds, as_of: update.asOf })}\n\n`);
    });
    // Comment heartbeat keeps proxies from closing an idle connection.
    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 25_000);
    if (typeof heartbeat.unref === 'function') heartbeat.unref();

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
