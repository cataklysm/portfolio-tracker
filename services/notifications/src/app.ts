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
import type { NotificationsConfig } from './config/config.js';
import type { NotificationsDatabase } from './platform/database/schema.js';
import {
  EventsEarningsClient,
  InsightsTargetsClient,
  ListingResolverClient,
  MarketFxClient,
  MarketQuotesClient,
  PortfolioPositionsClient,
} from './platform/clients.js';
import {
  AlertEvaluator,
  EvaluationScheduler,
  KyselyAlertRuleRepository,
  KyselyAlertStateRepository,
  KyselyNotificationEventStore,
  KyselyNotificationRepository,
  LiveNotificationHub,
  LiveNotificationStream,
  NotificationService,
  NotificationRetentionScheduler,
  RuleService,
  registerNotificationRoutes,
} from './modules/alerts/index.js';
import { InterestService, KyselyUserInterestRepository } from './modules/interests/index.js';

export interface BuiltService {
  app: FastifyInstance;
  shutdown: () => Promise<void>;
}

/**
 * Composition root for the notifications service. Owns `notifications.*`,
 * consumes the `portfolio` stream into a per-user interest projection, evaluates
 * Â§2.7 alerts on a schedule, and serves each user's inbox over HTTP.
 */
export async function buildApp(config: NotificationsConfig): Promise<BuiltService> {
  const logger = createLogger({
    service: 'notifications',
    serviceVersion: config.serviceVersion,
    environment: config.environment,
    pretty: config.environment === 'development',
  });

  const { db, pool } = createDatabase<NotificationsDatabase>({ connectionString: config.databaseUrl, logger });
  const redis: RedisClientType = createRedis({ url: config.redisUrl, logger });
  const verifier = new UserTokenVerifier(config.auth);

  const interests = new KyselyUserInterestRepository(db);
  const notificationRepo = new KyselyNotificationRepository(db);
  const alertState = new KyselyAlertStateRepository(db);
  const ruleRepo = new KyselyAlertRuleRepository(db);

  const notificationService = new NotificationService(notificationRepo);
  const ruleService = new RuleService(ruleRepo, alertState);
  const liveHub = new LiveNotificationHub();
  const interestService = new InterestService(interests, logger);

  const evaluator = new AlertEvaluator({
    interests,
    notifications: notificationRepo,
    alertState,
    events: new KyselyNotificationEventStore(db),
    rules: ruleRepo,
    resolver: new ListingResolverClient(config.instrumentsBaseUrl, logger),
    fx: new MarketFxClient(config.marketBaseUrl, logger),
    quotes: new MarketQuotesClient(config.marketBaseUrl, logger),
    earnings: new EventsEarningsClient(config.eventsBaseUrl, logger),
    targets: new InsightsTargetsClient(config.insightsBaseUrl, logger),
    positions: new PortfolioPositionsClient(config.portfolioBaseUrl, logger),
    logger,
  });

  const app = await createService({
    name: 'notifications',
    logger,
    health: {
      ready: async () => {
        await sql`SELECT 1`.execute(db);
        await redis.ping();
      },
    },
  });

  registerNotificationRoutes(app, {
    service: notificationService,
    rules: ruleService,
    live: liveHub,
    authenticate: verifier.authenticate,
    requireScope: (scope) => verifier.requireScope(scope),
  });

  await connectRedis(redis);

  const publisher = new OutboxPublisher({
    db,
    redis,
    producer: 'notifications',
    outbox: { schema: 'notifications', table: 'outbox_events' },
    logger,
  });
  publisher.start();

  const scheduler = new EvaluationScheduler(evaluator, config.evaluation.intervalMs, logger);
  const retentionScheduler = new NotificationRetentionScheduler(
    notificationService,
    config.retention.readDays,
    config.retention.cleanupIntervalMs,
    logger,
  );
  const liveStream = new LiveNotificationStream({
    redis,
    hub: liveHub,
    service: notificationService,
    logger,
  });
  await liveStream.start();
  retentionScheduler.start();
  let consumer: StreamConsumer | undefined;
  if (config.consumeInterestStream) {
    consumer = new StreamConsumer({
      redis,
      stream: 'portfolio',
      group: 'notifications',
      consumer: `notifications-${process.pid}`,
      handler: (envelope) => interestService.applyInterestEvent(envelope),
      logger,
    });
    await consumer.start();
  }
  if (config.evaluation.enabled) scheduler.start();

  return {
    app,
    shutdown: async () => {
      scheduler.stop();
      retentionScheduler.stop();
      publisher.stop();
      await liveStream.stop();
      if (consumer) await consumer.stop();
      await app.close();
      await redis.quit();
      await pool.end();
    },
  };
}
