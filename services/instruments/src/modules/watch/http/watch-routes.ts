import type { FastifyInstance } from 'fastify';
import type { WatchService } from '../application/watch-service.js';

export interface WatchRouteDeps {
  service: WatchService;
}

/**
 * Internal-only watch-set snapshot, consumed by the market/fundamentals/events
 * refresh workers to hydrate their in-memory set on startup. Must be network/
 * gateway restricted (no auth, like the listing-resolve endpoint).
 */
export function registerWatchRoutes(app: FastifyInstance, deps: WatchRouteDeps): void {
  app.get('/internal/watch-set', async () => deps.service.listWatchSet());
}
