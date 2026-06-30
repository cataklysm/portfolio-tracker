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
import type { PortfolioConfig } from './config/config.js';
import type { PortfolioDatabase } from './platform/database/schema.js';
import {
  PortfolioService,
  KyselyPortfolioRepository,
  registerPortfolioRoutes,
} from './modules/portfolios/index.js';
import {
  PositionService,
  KyselyPositionRepository,
  InstrumentsListingClient,
  MarketQuoteClient,
  MarketFxClient,
  AuthSettingsClient,
  registerPositionRoutes,
} from './modules/positions/index.js';
import {
  WatchlistService,
  KyselyWatchlistRepository,
  registerWatchlistRoutes,
} from './modules/watchlist/index.js';
import {
  CashFlowService,
  KyselyCashFlowRepository,
  registerCashFlowRoutes,
} from './modules/cash-flows/index.js';
import {
  TaxEventService,
  KyselyTaxEventRepository,
  registerTaxEventRoutes,
} from './modules/tax-events/index.js';
import { KyselyChangeLogRepository, registerChangeLogRoutes } from './modules/audit/index.js';
import { ActivityService, KyselyActivityRepository, registerActivityRoutes } from './modules/activity/index.js';
import {
  CorporateActionService,
  KyselyCorporateActionRepository,
  registerCorporateActionRoutes,
} from './modules/corporate-actions/index.js';
import { ReportingService, registerReportingRoutes } from './modules/reporting/index.js';
import {
  TaxRuleService,
  KyselyTaxRuleRepository,
  registerTaxRuleRoutes,
} from './modules/tax-rules/index.js';
import {
  TaxSettingsService,
  KyselyUserTaxSettingsRepository,
  KyselyPortfolioTaxSettingsRepository,
  registerTaxSettingsRoutes,
} from './modules/tax-settings/index.js';
import { TaxEstimateService, registerTaxEstimateRoutes } from './modules/tax-calc/index.js';
import {
  LiveQuoteHub,
  LiveQuoteFanout,
  KyselyHoldingsRepository,
  MarketQuoteStream,
  registerLiveQuoteRoutes,
} from './modules/live-quotes/index.js';

export interface BuiltService {
  app: FastifyInstance;
  shutdown: () => Promise<void>;
}

/** Composition root: build adapters, wire use cases, register feature routes. */
export async function buildApp(config: PortfolioConfig): Promise<BuiltService> {
  const logger = createLogger({
    service: 'portfolio',
    serviceVersion: config.serviceVersion,
    environment: config.environment,
    pretty: config.environment === 'development',
  });

  const { db, pool } = createDatabase<PortfolioDatabase>({
    connectionString: config.databaseUrl,
    logger,
  });

  const redis: RedisClientType = createRedis({ url: config.redisUrl, logger });
  const verifier = new UserTokenVerifier(config.auth);

  // Cross-service read clients, shared by positions and watchlist.
  const listingClient = new InstrumentsListingClient(config.instrumentsBaseUrl);
  const quoteClient = new MarketQuoteClient(config.marketBaseUrl, logger);
  const fxClient = new MarketFxClient(config.marketBaseUrl, logger);
  const settingsClient = new AuthSettingsClient(config.authBaseUrl);

  // The change-log repo also acts as the transactional ChangeRecorder injected
  // into the booking repos, so each financial write and its audit row commit
  // atomically (same DB transaction).
  const changeLog = new KyselyChangeLogRepository(db);
  const portfolioRepo = new KyselyPortfolioRepository(db);
  const positionRepo = new KyselyPositionRepository(db, changeLog);
  const cashFlowRepo = new KyselyCashFlowRepository(db, changeLog);
  const taxEventRepo = new KyselyTaxEventRepository(db, changeLog);
  const userTaxRepo = new KyselyUserTaxSettingsRepository(db);
  const portfolioTaxRepo = new KyselyPortfolioTaxSettingsRepository(db);
  const activityService = new ActivityService(new KyselyActivityRepository(db));
  const corporateActionRepo = new KyselyCorporateActionRepository(db);
  const portfolioService = new PortfolioService(portfolioRepo);
  const watchlistService = new WatchlistService({
    repo: new KyselyWatchlistRepository(db),
    listings: listingClient,
    quotes: quoteClient,
  });
  const positionService = new PositionService({
    repo: positionRepo,
    listings: listingClient,
    quotes: quoteClient,
    fx: fxClient,
    settings: settingsClient,
    taxEvents: taxEventRepo,
    corporateActions: corporateActionRepo,
  });
  const corporateActionService = new CorporateActionService({ repo: corporateActionRepo, positions: positionService });
  // PositionService doubles as the open-quantity reader for event-linked dividend
  // bookings (quantity held at the ex-date).
  const cashFlowService = new CashFlowService(cashFlowRepo, positionService);
  const taxEventService = new TaxEventService(taxEventRepo);
  const taxRuleService = new TaxRuleService(new KyselyTaxRuleRepository(db));
  const taxSettingsService = new TaxSettingsService(userTaxRepo, portfolioTaxRepo, taxRuleService);
  const taxEstimateService = new TaxEstimateService({
    positions: positionRepo,
    listings: listingClient,
    fx: fxClient,
    portfolioTax: portfolioTaxRepo,
    userTax: userTaxRepo,
    rules: taxRuleService,
    taxEvents: taxEventRepo,
  });
  const reportingService = new ReportingService({
    positions: positionService,
    cashFlows: cashFlowRepo,
    taxEvents: taxEventRepo,
    portfolios: portfolioRepo,
    fx: fxClient,
    quotes: quoteClient,
    settings: settingsClient,
  });

  const app = await createService({
    name: 'portfolio',
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

  // Live position updates: an in-memory hub of connected SSE clients, fed by a
  // tail of the market quote stream (started below). The hub is created only when
  // the feature is enabled; the route then 503s without it.
  const dumpMode = process.env['OPENAPI_DUMP'] === '1';
  const liveQuoteHub = config.liveQuotes.enabled ? new LiveQuoteHub() : undefined;

  registerPortfolioRoutes(app, { service: portfolioService, ...authDeps });
  registerPositionRoutes(app, { service: positionService, ...authDeps });
  registerWatchlistRoutes(app, { service: watchlistService, ...authDeps });
  registerCashFlowRoutes(app, { service: cashFlowService, ...authDeps });
  registerTaxEventRoutes(app, { service: taxEventService, ...authDeps });
  registerTaxRuleRoutes(app, { service: taxRuleService, ...authDeps });
  registerTaxSettingsRoutes(app, { service: taxSettingsService, ...authDeps });
  registerTaxEstimateRoutes(app, { service: taxEstimateService, ...authDeps });
  registerChangeLogRoutes(app, { reader: changeLog, ...authDeps });
  registerActivityRoutes(app, { service: activityService, ...authDeps });
  registerCorporateActionRoutes(app, { service: corporateActionService, ...authDeps });
  registerReportingRoutes(app, { service: reportingService, ...authDeps });
  registerLiveQuoteRoutes(app, { hub: liveQuoteHub, ...authDeps });

  // Redis is a required dependency for the event bus: connect last so wiring
  // and route-registration errors surface before the fail-fast dependency check.
  await connectRedis(redis);

  // Forward refresh-interest events (position/watchlist) to Redis Streams for
  // the market service to consume.
  const publisher = new OutboxPublisher({
    db,
    redis,
    producer: 'portfolio',
    outbox: { schema: 'portfolio', table: 'outbox_events' },
    logger,
  });
  publisher.start();

  // Tail the market quote stream and fan out per-user SSE pings to connected
  // clients whose open positions were affected. Skipped during the spec-only dump
  // (it opens a duplicated Redis client directly).
  let marketQuoteStream: MarketQuoteStream | undefined;
  if (liveQuoteHub && !dumpMode) {
    const fanout = new LiveQuoteFanout({ hub: liveQuoteHub, holdings: new KyselyHoldingsRepository(db) });
    marketQuoteStream = new MarketQuoteStream({ redis, fanout, logger });
    await marketQuoteStream.start();
  }

  return {
    app,
    shutdown: async () => {
      if (marketQuoteStream) await marketQuoteStream.stop();
      publisher.stop();
      await app.close();
      await redis.quit();
      await pool.end();
    },
  };
}
