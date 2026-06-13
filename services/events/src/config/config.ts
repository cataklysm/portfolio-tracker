import { boolEnv, intEnv, optionalEnv, requireEnv } from '@portfolio/platform';

/**
 * Events service configuration. Owns `events.*`. Consumes the portfolio event
 * stream to learn which instruments are held/watched, then refreshes their
 * earnings, corporate actions, and news in the background via the providers
 * service.
 */
export interface EventsConfig {
  port: number;
  environment: string;
  serviceVersion: string;
  databaseUrl: string;
  redisUrl: string;
  instrumentsBaseUrl: string;
  providersBaseUrl: string;
  auth: { jwksUri: string; issuer: string; audience: string };
  refresh: {
    enabled: boolean;
    intervalMs: number;
    /** Skip an instrument refreshed more recently than this. */
    minAgeMs: number;
  };
  /** Reads the portfolio interest stream to maintain the refresh projection. */
  consumeInterestStream: boolean;
}

export function loadConfig(): EventsConfig {
  const issuer = optionalEnv('AUTH_JWT_ISSUER') ?? 'http://localhost:3002';
  return {
    port: intEnv('EVENTS_PORT', 3008),
    environment: optionalEnv('NODE_ENV') ?? 'development',
    serviceVersion: optionalEnv('SERVICE_VERSION') ?? '0.1.0',
    databaseUrl: optionalEnv('EVENTS_DATABASE_URL') ?? requireEnv('DATABASE_URL'),
    redisUrl: optionalEnv('VALKEY_URL') ?? optionalEnv('REDIS_URL') ?? requireEnv('VALKEY_URL'),
    instrumentsBaseUrl: optionalEnv('INSTRUMENTS_BASE_URL') ?? 'http://localhost:3004',
    providersBaseUrl: optionalEnv('PROVIDERS_BASE_URL') ?? 'http://localhost:3010',
    auth: {
      jwksUri: optionalEnv('AUTH_JWKS_URI') ?? `${issuer}/.well-known/jwks.json`,
      issuer,
      audience: optionalEnv('AUTH_JWT_AUDIENCE') ?? 'portfolio-platform',
    },
    refresh: {
      enabled: boolEnv('EVENTS_REFRESH_ENABLED', true),
      intervalMs: intEnv('EVENTS_REFRESH_INTERVAL_MS', 60 * 60 * 1000),
      minAgeMs: intEnv('EVENTS_MIN_AGE_MS', 6 * 60 * 60 * 1000),
    },
    consumeInterestStream: boolEnv('EVENTS_CONSUME_INTEREST_STREAM', true),
  };
}
