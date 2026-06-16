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
import type { FundamentalsConfig } from './config/config.js';
import type { FundamentalsDatabase } from './platform/database/schema.js';
import { ProvidersClient } from './platform/providers/providers-client.js';
import {
  FundamentalsService,
  KyselyFundamentalsRepository,
  KyselyFundamentalsEventStore,
  ProvidersFundamentalsProvider,
  InstrumentsPlanClient,
  registerFundamentalsRoutes,
} from './modules/snapshots/index.js';
import { RefreshService, RefreshScheduler, InstrumentsListingsClient } from './modules/refresh/index.js';

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
  // The active-listing set (whole catalog) and the per-capability provider plan.
  const listings = new InstrumentsListingsClient(config.instrumentsBaseUrl, logger);
  const planResolver = new InstrumentsPlanClient(config.instrumentsBaseUrl, logger);

  const fundamentalsService = new FundamentalsService({
    repo: new KyselyFundamentalsRepository(db),
    provider: new ProvidersFundamentalsProvider(providers),
    planResolver,
    events: new KyselyFundamentalsEventStore(db),
    logger,
    minAgeMs: config.refresh.minAgeMs,
  });

  const refreshService = new RefreshService({
    listings,
    fundamentals: fundamentalsService,
    providers,
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
