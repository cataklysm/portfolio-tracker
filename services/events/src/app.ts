import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import {
  connectRedis,
  createDatabase,
  createLogger,
  createRedis,
  createService,
  OutboxPublisher,
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
  InstrumentsPlanClient,
  registerEventsRoutes,
} from './modules/feed/index.js';
import { RefreshService, RefreshScheduler, InstrumentsListingsClient } from './modules/refresh/index.js';

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
  // The active-listing set (whole catalog) and the per-capability provider plan.
  const listings = new InstrumentsListingsClient(config.instrumentsBaseUrl, logger);
  const planResolver = new InstrumentsPlanClient(config.instrumentsBaseUrl, logger);

  const eventsService = new EventsService({
    earnings: new KyselyEarningsRepository(db),
    corporateActions: new KyselyCorporateActionsRepository(db),
    news: new KyselyNewsRepository(db),
    refreshState: new KyselyRefreshStateRepository(db),
    provider: new ProvidersEventsProvider(providers),
    planResolver,
    events: new KyselyEventsEventStore(db),
    logger,
    minAgeMs: config.refresh.minAgeMs,
    newsReadLimit: 20,
  });

  const refreshService = new RefreshService({
    listings,
    events: eventsService,
    providers,
    logger,
  });

  const app = await createService({
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

  // Drive the periodic refresh. Each cycle pulls the active-listing set from the
  // instruments service (whole catalog).
  const scheduler = new RefreshScheduler(refreshService, config.refresh.tickMs, logger);
  if (config.refresh.enabled) {
    scheduler.start();
  }

  return {
    app,
    shutdown: async () => {
      scheduler.stop();
      publisher.stop();
      await app.close();
      await redis.quit();
      await pool.end();
    },
  };
}
