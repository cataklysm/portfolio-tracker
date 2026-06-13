import { boolEnv, intEnv, optionalEnv, requireEnv } from '@portfolio/platform';

/**
 * Fundamentals service configuration. Owns `fundamentals.*`. Consumes the
 * portfolio event stream to learn which instruments are held/watched, then
 * refreshes their fundamentals in the background via the providers service.
 */
export interface FundamentalsConfig {
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
    /** Skip an instrument whose newest snapshot is younger than this. */
    minAgeMs: number;
  };
  /** Reads the portfolio interest stream to maintain the refresh projection. */
  consumeInterestStream: boolean;
}

export function loadConfig(): FundamentalsConfig {
  const issuer = optionalEnv('AUTH_JWT_ISSUER') ?? 'http://localhost:3002';
  return {
    port: intEnv('FUNDAMENTALS_PORT', 3007),
    environment: optionalEnv('NODE_ENV') ?? 'development',
    serviceVersion: optionalEnv('SERVICE_VERSION') ?? '0.1.0',
    databaseUrl: optionalEnv('FUNDAMENTALS_DATABASE_URL') ?? requireEnv('DATABASE_URL'),
    redisUrl: optionalEnv('VALKEY_URL') ?? optionalEnv('REDIS_URL') ?? requireEnv('VALKEY_URL'),
    instrumentsBaseUrl: optionalEnv('INSTRUMENTS_BASE_URL') ?? 'http://localhost:3004',
    providersBaseUrl: optionalEnv('PROVIDERS_BASE_URL') ?? 'http://localhost:3010',
    auth: {
      jwksUri: optionalEnv('AUTH_JWKS_URI') ?? `${issuer}/.well-known/jwks.json`,
      issuer,
      audience: optionalEnv('AUTH_JWT_AUDIENCE') ?? 'portfolio-platform',
    },
    refresh: {
      enabled: boolEnv('FUNDAMENTALS_REFRESH_ENABLED', true),
      intervalMs: intEnv('FUNDAMENTALS_REFRESH_INTERVAL_MS', 60 * 60 * 1000),
      minAgeMs: intEnv('FUNDAMENTALS_MIN_AGE_MS', 20 * 60 * 60 * 1000),
    },
    consumeInterestStream: boolEnv('FUNDAMENTALS_CONSUME_INTEREST_STREAM', true),
  };
}
