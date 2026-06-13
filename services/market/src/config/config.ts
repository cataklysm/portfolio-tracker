import { boolEnv, intEnv, optionalEnv, requireEnv } from '@portfolio/platform';

/** Market service configuration. */
export interface MarketConfig {
  port: number;
  environment: string;
  serviceVersion: string;
  databaseUrl: string;
  redisUrl: string;
  instrumentsBaseUrl: string;
  /** The providers service — market's single egress to external data sources. */
  providersBaseUrl: string;
  auth: { jwksUri: string; issuer: string; audience: string };
  refresh: {
    enabled: boolean;
    intervalMs: number;
    heldQuoteMaxAgeMs: number;
  };
  /** Reads the portfolio interest stream to maintain the refresh projection. */
  consumeInterestStream: boolean;
}

export function loadConfig(): MarketConfig {
  const issuer = optionalEnv('AUTH_JWT_ISSUER') ?? 'http://localhost:3002';
  return {
    port: intEnv('MARKET_PORT', 3005),
    environment: optionalEnv('NODE_ENV') ?? 'development',
    serviceVersion: optionalEnv('SERVICE_VERSION') ?? '0.1.0',
    databaseUrl: optionalEnv('MARKET_DATABASE_URL') ?? requireEnv('DATABASE_URL'),
    redisUrl: optionalEnv('VALKEY_URL') ?? optionalEnv('REDIS_URL') ?? requireEnv('VALKEY_URL'),
    instrumentsBaseUrl: optionalEnv('INSTRUMENTS_BASE_URL') ?? 'http://localhost:3004',
    providersBaseUrl: optionalEnv('PROVIDERS_BASE_URL') ?? 'http://localhost:3010',
    auth: {
      jwksUri: optionalEnv('AUTH_JWKS_URI') ?? `${issuer}/.well-known/jwks.json`,
      issuer,
      audience: optionalEnv('AUTH_JWT_AUDIENCE') ?? 'portfolio-platform',
    },
    refresh: {
      enabled: boolEnv('MARKET_REFRESH_ENABLED', true),
      intervalMs: intEnv('MARKET_REFRESH_INTERVAL_MS', 15 * 60 * 1000),
      heldQuoteMaxAgeMs: intEnv('MARKET_HELD_QUOTE_MAX_AGE_MS', 15 * 60 * 1000),
    },
    consumeInterestStream: boolEnv('MARKET_CONSUME_INTEREST_STREAM', true),
  };
}
