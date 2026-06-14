import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import {
  connectRedis,
  createDatabase,
  createLogger,
  createRedis,
  createService,
  OutboxPublisher,
  WatchSet,
  UserTokenVerifier,
  type RedisClientType,
} from '@portfolio/platform';
import type { EventsConfig } from './config/config.js';
import type { EventsDatabase } from './platform/database/schema.js';
import { ProvidersClient } from './platform/providers/providers-client.js';
import {
  EventsService,
  KyselyEarningsRepository,
  KyselyCorporateActionsRepository,
  KyselyNewsRepository,
  KyselyRefreshStateRepository,
  KyselyEventsEventStore,
  ProvidersEventsProvider,
  InstrumentsListingResolver,
  registerEventsRoutes,
} from './modules/feed/index.js';
import { RefreshService, RefreshScheduler } from './modules/refresh/index.js';

export interface BuiltService {
  app: FastifyInstance;
  shutdown: () => Promise<void>;
}

/**
 * Composition root for the events service. Owns `events.*`, consumes the
 * `portfolio` interest stream to learn which instruments matter, refreshes their
 * earnings/corporate-actions/news via the providers service in the background,
 * and serves stored event data over HTTP.
 */
export async function buildApp(config: EventsConfig): Promise<BuiltService> {
  const logger = createLogger({
    service: 'events',
    serviceVersion: config.serviceVersion,
    environment: config.environment,
    pretty: config.environment === 'development',
  });

  const { db, pool } = createDatabase<EventsDatabase>({ connectionString: config.databaseUrl, logger });
  const redis: RedisClientType = createRedis({ url: config.redisUrl, logger });
  const verifier = new UserTokenVerifier(config.auth);

  const providers = new ProvidersClient(config.providersBaseUrl, logger);
  const resolver = new InstrumentsListingResolver(config.instrumentsBaseUrl, logger);

  // The deduped watched-listing set, owned by the instruments service: hydrated
  // from its snapshot and kept live via instruments.watch.* deltas.
  const watchSet = new WatchSet({
    snapshotUrl: new URL('/internal/watch-set', config.instrumentsBaseUrl).toString(),
    redis,
    group: 'events-watch',
    consumer: `events-watch-${process.pid}`,
    logger,
  });

  const eventsService = new EventsService({
    earnings: new KyselyEarningsRepository(db),
    corporateActions: new KyselyCorporateActionsRepository(db),
    news: new KyselyNewsRepository(db),
    refreshState: new KyselyRefreshStateRepository(db),
    provider: new ProvidersEventsProvider(providers),
    resolver,
    events: new KyselyEventsEventStore(db),
    logger,
    minAgeMs: config.refresh.minAgeMs,
    newsReadLimit: 20,
  });

  const refreshService = new RefreshService({
    watchSet,
    events: eventsService,
    logger,
  });

  const app = createService({
    name: 'events',
    logger,
    health: {
      ready: async () => {
        await sql`SELECT 1`.execute(db);
        await redis.ping();
      },
    },
  });

  registerEventsRoutes(app, {
    service: eventsService,
    authenticate: verifier.authenticate,
    requireScope: (scope) => verifier.requireScope(scope),
  });

  await connectRedis(redis);

  const publisher = new OutboxPublisher({
    db,
    redis,
    producer: 'events',
    outbox: { schema: 'events', table: 'outbox_events' },
    logger,
  });
  publisher.start();

  // Hydrate the watch set from the instruments snapshot before the first refresh
  // cycle, then drive the periodic refresh. The watch set only feeds the refresh
  // cycle, so it shares the refresh on/off switch.
  const scheduler = new RefreshScheduler(refreshService, config.refresh.intervalMs, logger);
  if (config.refresh.enabled) {
    await watchSet.start();
    scheduler.start();
  }

  return {
    app,
    shutdown: async () => {
      scheduler.stop();
      publisher.stop();
      await watchSet.stop();
      await app.close();
      await redis.quit();
      await pool.end();
    },
  };
}
