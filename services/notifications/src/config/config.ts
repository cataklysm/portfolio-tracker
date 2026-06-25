import { boolEnv, intEnv, optionalEnv, requireEnv } from '@portfolio/platform';

/**
 * Notifications service configuration. Owns `notifications.*`. Consumes the
 * portfolio interest stream to learn each user's held/watched listings, then
 * evaluates §2.7 alert conditions on a schedule against data pulled from the
 * market, events, and insights services via their internal endpoints.
 */
export interface NotificationsConfig {
  port: number;
  environment: string;
  serviceVersion: string;
  databaseUrl: string;
  redisUrl: string;
  instrumentsBaseUrl: string;
  marketBaseUrl: string;
  insightsBaseUrl: string;
  eventsBaseUrl: string;
  portfolioBaseUrl: string;
  auth: { jwksUri: string; issuer: string; audience: string };
  evaluation: {
    enabled: boolean;
    intervalMs: number;
    /** Significant daily move threshold, in percent. */
    dailyMovePct: number;
    /** Upcoming-earnings horizon, in days. */
    earningsWithinDays: number;
  };
  retention: {
    readDays: number;
    cleanupIntervalMs: number;
  };
  consumeInterestStream: boolean;
  /**
   * Web Push (VAPID) for desktop notifications. `enabled` is true only when both
   * keys are configured; otherwise the subscription endpoints still store data
   * but no push is sent and the public-key endpoint returns null.
   */
  push: {
    enabled: boolean;
    publicKey: string | null;
    privateKey: string | null;
    subject: string;
  };
}

export function loadConfig(): NotificationsConfig {
  const issuer = optionalEnv('AUTH_JWT_ISSUER') ?? 'http://localhost:3002';
  const vapidPublicKey = optionalEnv('VAPID_PUBLIC_KEY') ?? null;
  const vapidPrivateKey = optionalEnv('VAPID_PRIVATE_KEY') ?? null;
  return {
    port: intEnv('NOTIFICATIONS_PORT', 3009),
    environment: optionalEnv('NODE_ENV') ?? 'development',
    serviceVersion: optionalEnv('SERVICE_VERSION') ?? '0.1.0',
    databaseUrl: optionalEnv('NOTIFICATIONS_DATABASE_URL') ?? requireEnv('DATABASE_URL'),
    redisUrl: optionalEnv('VALKEY_URL') ?? optionalEnv('REDIS_URL') ?? requireEnv('VALKEY_URL'),
    instrumentsBaseUrl: optionalEnv('INSTRUMENTS_BASE_URL') ?? 'http://localhost:3004',
    marketBaseUrl: optionalEnv('MARKET_BASE_URL') ?? 'http://localhost:3005',
    insightsBaseUrl: optionalEnv('INSIGHTS_BASE_URL') ?? 'http://localhost:3006',
    eventsBaseUrl: optionalEnv('EVENTS_BASE_URL') ?? 'http://localhost:3008',
    portfolioBaseUrl: optionalEnv('PORTFOLIO_BASE_URL') ?? 'http://localhost:3003',
    auth: {
      jwksUri: optionalEnv('AUTH_JWKS_URI') ?? `${issuer}/.well-known/jwks.json`,
      issuer,
      audience: optionalEnv('AUTH_JWT_AUDIENCE') ?? 'portfolio-platform',
    },
    evaluation: {
      enabled: boolEnv('NOTIFICATIONS_EVAL_ENABLED', true),
      intervalMs: intEnv('NOTIFICATIONS_EVAL_INTERVAL_MS', 15 * 60 * 1000),
      dailyMovePct: Number(optionalEnv('NOTIFICATIONS_DAILY_MOVE_PCT') ?? '5'),
      earningsWithinDays: intEnv('NOTIFICATIONS_EARNINGS_WITHIN_DAYS', 7),
    },
    retention: {
      readDays: intEnv('NOTIFICATIONS_READ_RETENTION_DAYS', 14),
      cleanupIntervalMs: intEnv('NOTIFICATIONS_RETENTION_CLEANUP_INTERVAL_MS', 24 * 60 * 60 * 1000),
    },
    consumeInterestStream: boolEnv('NOTIFICATIONS_CONSUME_INTEREST_STREAM', true),
    push: {
      enabled: Boolean(vapidPublicKey && vapidPrivateKey),
      publicKey: vapidPublicKey,
      privateKey: vapidPrivateKey,
      subject: optionalEnv('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
    },
  };
}
