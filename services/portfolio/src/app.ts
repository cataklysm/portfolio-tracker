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

  const portfolioRepo = new KyselyPortfolioRepository(db);
  const positionRepo = new KyselyPositionRepository(db);
  const cashFlowRepo = new KyselyCashFlowRepository(db);
  const taxEventRepo = new KyselyTaxEventRepository(db);
  const userTaxRepo = new KyselyUserTaxSettingsRepository(db);
  const portfolioTaxRepo = new KyselyPortfolioTaxSettingsRepository(db);
  const changeLog = new KyselyChangeLogRepository(db);
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
    changeLog,
    corporateActions: corporateActionRepo,
  });
  const corporateActionService = new CorporateActionService({ repo: corporateActionRepo, positions: positionService });
  const cashFlowService = new CashFlowService(cashFlowRepo, changeLog);
  const taxEventService = new TaxEventService(taxEventRepo, changeLog);
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

  const app = createService({
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

  return {
    app,
    shutdown: async () => {
      publisher.stop();
      await app.close();
      await redis.quit();
      await pool.end();
    },
  };
}
