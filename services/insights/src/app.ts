import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import {
  connectRedis,
  createDatabase,
  createLogger,
  createRedis,
  createService,
  StreamConsumer,
  UserTokenVerifier,
  type RedisClientType,
} from '@portfolio/platform';
import type { InsightsConfig } from './config/config.js';
import type { InsightsDatabase } from './platform/database/schema.js';
import {
  AssessmentService,
  KyselyAssessmentRepository,
  registerAssessmentRoutes,
  type AnalystAssessmentPayload,
} from './modules/assessments/index.js';

export interface BuiltService {
  app: FastifyInstance;
  shutdown: () => Promise<void>;
}

/**
 * Composition root for the insights service. Owns `insights.*` and consumes the
 * `market` Redis stream to store global analyst records.
 */
export async function buildApp(config: InsightsConfig): Promise<BuiltService> {
  const logger = createLogger({
    service: 'insights',
    serviceVersion: config.serviceVersion,
    environment: config.environment,
    pretty: config.environment === 'development',
  });

  const { db, pool } = createDatabase<InsightsDatabase>({
    connectionString: config.databaseUrl,
    logger,
  });

  const redis: RedisClientType = createRedis({ url: config.redisUrl, logger });
  const verifier = new UserTokenVerifier(config.auth);
  const assessmentService = new AssessmentService(new KyselyAssessmentRepository(db));

  const app = createService({
    name: 'insights',
    logger,
    health: {
      ready: async () => {
        await sql`SELECT 1`.execute(db);
        await redis.ping();
      },
    },
  });

  registerAssessmentRoutes(app, {
    service: assessmentService,
    authenticate: verifier.authenticate,
    requireScope: (scope) => verifier.requireScope(scope),
  });

  await connectRedis(redis);

  // Consume analyst-assessment events from the market service.
  let consumer: StreamConsumer | undefined;
  if (config.consumeAnalystStream) {
    consumer = new StreamConsumer({
      redis,
      stream: 'market',
      group: 'insights',
      consumer: `insights-${process.pid}`,
      handler: async (envelope) => {
        if (envelope.event_type !== 'market.analyst_assessment.updated') return;
        await assessmentService.ingestAnalystAssessment(envelope.payload as unknown as AnalystAssessmentPayload);
      },
      logger,
    });
    await consumer.start();
  }

  return {
    app,
    shutdown: async () => {
      if (consumer) await consumer.stop();
      await app.close();
      await redis.quit();
      await pool.end();
    },
  };
}
