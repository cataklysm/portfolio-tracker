import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import {
  connectRedis,
  createDatabase,
  createLogger,
  createRedis,
  createService,
  OutboxPublisher,
  StreamConsumer,
  UserTokenVerifier,
  type RedisClientType,
} from '@portfolio/platform';
import type { InstrumentsConfig } from './config/config.js';
import type { InstrumentsDatabase } from './platform/database/schema.js';
import { CatalogService, KyselyCatalogRepository, registerCatalogRoutes } from './modules/catalog/index.js';
import { WatchService, KyselyWatchRepository, registerWatchRoutes } from './modules/watch/index.js';

export interface BuiltService {
  app: FastifyInstance;
  shutdown: () => Promise<void>;
}

/** Composition root for the instruments service. */
export async function buildApp(config: InstrumentsConfig): Promise<BuiltService> {
  const logger = createLogger({
    service: 'instruments',
    serviceVersion: config.serviceVersion,
    environment: config.environment,
    pretty: config.environment === 'development',
  });

  const { db, pool } = createDatabase<InstrumentsDatabase>({
    connectionString: config.databaseUrl,
    logger,
  });

  const redis: RedisClientType = createRedis({ url: config.redisUrl, logger });
  const verifier = new UserTokenVerifier(config.auth);
  const catalogService = new CatalogService(new KyselyCatalogRepository(db));
  const watchService = new WatchService({
    repo: new KyselyWatchRepository(db),
    provider: config.watchProvider,
    logger,
  });

  const app = createService({
    name: 'instruments',
    logger,
    health: {
      ready: async () => {
        await sql`SELECT 1`.execute(db);
        await redis.ping();
      },
    },
  });

  registerCatalogRoutes(app, {
    service: catalogService,
    authenticate: verifier.authenticate,
    requireScope: (scope) => verifier.requireScope(scope),
  });
  registerWatchRoutes(app, { service: watchService });

  // Redis is a required dependency: connect last so wiring/route-registration
  // errors surface first, then fail fast if the event bus is unreachable.
  await connectRedis(redis);

  // Forward outbox events (instruments.listing.created, instruments.watch.*) to
  // the `instruments` Redis stream.
  const publisher = new OutboxPublisher({
    db,
    redis,
    producer: 'instruments',
    outbox: { schema: 'instruments', table: 'outbox_events' },
    logger,
  });
  publisher.start();

  // Consume portfolio interest events into the canonical watch-set projection.
  // The group is created at offset 0, so a fresh deploy replays the backlog and
  // builds the projection without an explicit backfill.
  let watchConsumer: StreamConsumer | undefined;
  if (config.consumeInterestStream) {
    watchConsumer = new StreamConsumer({
      redis,
      stream: 'portfolio',
      group: 'instruments-watch',
      consumer: `instruments-watch-${process.pid}`,
      handler: (envelope) => watchService.applyInterestEvent(envelope),
      logger,
    });
    await watchConsumer.start();
  }

  return {
    app,
    shutdown: async () => {
      publisher.stop();
      if (watchConsumer) await watchConsumer.stop();
      await app.close();
      await redis.quit();
      await pool.end();
    },
  };
}
