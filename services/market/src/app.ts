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
import type { MarketConfig } from './config/config.js';
import type { MarketDatabase } from './platform/database/schema.js';
import { ProvidersClient } from './platform/providers/providers-client.js';
import {
  QuoteService,
  KyselyQuoteRepository,
  ProvidersQuoteProvider,
  InstrumentsListingResolver,
  registerQuoteRoutes,
} from './modules/quotes/index.js';
import { FxService, KyselyFxRepository, ProvidersFxProvider, registerFxRoutes } from './modules/fx/index.js';
import {
  DiscoveryService,
  ProvidersDiscoveryProvider,
  registerDiscoveryRoutes,
} from './modules/discovery/index.js';
import { RefreshService, KyselyRefreshStateRepository, RefreshScheduler } from './modules/refresh/index.js';
import { AnalystService, ProvidersAnalystProvider, KyselyAnalystEventStore } from './modules/analyst/index.js';

export interface BuiltService {
  app: FastifyInstance;
  shutdown: () => Promise<void>;
}

/** Composition root for the market service. */
export async function buildApp(config: MarketConfig): Promise<BuiltService> {
  const logger = createLogger({
    service: 'market',
    serviceVersion: config.serviceVersion,
    environment: config.environment,
    pretty: config.environment === 'development',
  });

  const { db, pool } = createDatabase<MarketDatabase>({ connectionString: config.databaseUrl, logger });
  const redis: RedisClientType = createRedis({ url: config.redisUrl, logger });
  const verifier = new UserTokenVerifier(config.auth);

  const providers = new ProvidersClient(config.providersBaseUrl, logger);

  const resolver = new InstrumentsListingResolver(config.instrumentsBaseUrl, logger);

  // The deduped watched-listing set, owned by the instruments service: hydrated
  // from its snapshot and kept live via instruments.watch.* deltas.
  const watchSet = new WatchSet({
    snapshotUrl: new URL('/internal/watch-set', config.instrumentsBaseUrl).toString(),
    redis,
    group: 'market-watch',
    consumer: `market-watch-${process.pid}`,
    logger,
  });

  const quoteService = new QuoteService({
    repo: new KyselyQuoteRepository(db),
    provider: new ProvidersQuoteProvider(providers),
    resolver,
    staleAfterMs: config.refresh.heldQuoteMaxAgeMs,
  });
  const fxService = new FxService({ repo: new KyselyFxRepository(db), provider: new ProvidersFxProvider(providers) });
  const discoveryService = new DiscoveryService(new ProvidersDiscoveryProvider(providers));
  const analystService = new AnalystService({
    resolver,
    provider: new ProvidersAnalystProvider(providers),
    events: new KyselyAnalystEventStore(db),
    logger,
  });
  const refreshService = new RefreshService({
    watchSet,
    refreshState: new KyselyRefreshStateRepository(db),
    quotes: quoteService,
    fx: fxService,
    analyst: analystService,
    logger,
    intervalMs: config.refresh.intervalMs,
  });

  const app = createService({
    name: 'market',
    logger,
    health: {
      ready: async () => {
        await sql`SELECT 1`.execute(db);
        await redis.ping();
      },
    },
  });

  const authDeps = {
    authenticate: verifier.authenticate,
    requireScope: (scope: string) => verifier.requireScope(scope),
  };
  registerQuoteRoutes(app, { service: quoteService, analyst: analystService, ...authDeps });
  registerFxRoutes(app, { service: fxService, ...authDeps });
  registerDiscoveryRoutes(app, { service: discoveryService });

  await connectRedis(redis);

  // Forward analyst-assessment events to the `market` Redis stream for insights.
  const publisher = new OutboxPublisher({
    db,
    redis,
    producer: 'market',
    outbox: { schema: 'market', table: 'outbox_events' },
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
