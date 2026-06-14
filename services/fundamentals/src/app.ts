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
import type { FundamentalsConfig } from './config/config.js';
import type { FundamentalsDatabase } from './platform/database/schema.js';
import { ProvidersClient } from './platform/providers/providers-client.js';
import {
  FundamentalsService,
  KyselyFundamentalsRepository,
  KyselyFundamentalsEventStore,
  ProvidersFundamentalsProvider,
  InstrumentsListingResolver,
  registerFundamentalsRoutes,
} from './modules/snapshots/index.js';
import { RefreshService, RefreshScheduler } from './modules/refresh/index.js';

export interface BuiltService {
  app: FastifyInstance;
  shutdown: () => Promise<void>;
}

/**
 * Composition root for the fundamentals service. Owns `fundamentals.*`, consumes
 * the `portfolio` interest stream to learn which instruments matter, refreshes
 * their fundamentals via the providers service in the background, and serves
 * stored snapshots over HTTP.
 */
export async function buildApp(config: FundamentalsConfig): Promise<BuiltService> {
  const logger = createLogger({
    service: 'fundamentals',
    serviceVersion: config.serviceVersion,
    environment: config.environment,
    pretty: config.environment === 'development',
  });

  const { db, pool } = createDatabase<FundamentalsDatabase>({ connectionString: config.databaseUrl, logger });
  const redis: RedisClientType = createRedis({ url: config.redisUrl, logger });
  const verifier = new UserTokenVerifier(config.auth);

  const providers = new ProvidersClient(config.providersBaseUrl, logger);
  const resolver = new InstrumentsListingResolver(config.instrumentsBaseUrl, logger);

  // The deduped watched-listing set, owned by the instruments service: hydrated
  // from its snapshot and kept live via instruments.watch.* deltas.
  const watchSet = new WatchSet({
    snapshotUrl: new URL('/internal/watch-set', config.instrumentsBaseUrl).toString(),
    redis,
    group: 'fundamentals-watch',
    consumer: `fundamentals-watch-${process.pid}`,
    logger,
  });

  const fundamentalsService = new FundamentalsService({
    repo: new KyselyFundamentalsRepository(db),
    provider: new ProvidersFundamentalsProvider(providers),
    resolver,
    events: new KyselyFundamentalsEventStore(db),
    logger,
    minAgeMs: config.refresh.minAgeMs,
  });

  const refreshService = new RefreshService({
    watchSet,
    fundamentals: fundamentalsService,
    logger,
  });

  const app = createService({
    name: 'fundamentals',
    logger,
    health: {
      ready: async () => {
        await sql`SELECT 1`.execute(db);
        await redis.ping();
      },
    },
  });

  registerFundamentalsRoutes(app, {
    service: fundamentalsService,
    authenticate: verifier.authenticate,
    requireScope: (scope) => verifier.requireScope(scope),
  });

  await connectRedis(redis);

  // Publish fundamentals.snapshot.updated events to the `fundamentals` stream.
  const publisher = new OutboxPublisher({
    db,
    redis,
    producer: 'fundamentals',
    outbox: { schema: 'fundamentals', table: 'outbox_events' },
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
