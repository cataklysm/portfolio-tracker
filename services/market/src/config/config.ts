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
    /** Heartbeat: how often the sweep wakes to evaluate per-provider due-ness. */
    tickMs: number;
    /** Fallback refresh interval for a provider/capability with no configured cadence. */
    defaultIntervalMs: number;
    /**
     * Window after an exchange's close during which the sweep does one extra
     * "catch the close" quote fetch, so the daily close is captured even though
     * the venue is now closed (and the freshness interval may not have elapsed).
     */
    closeCaptureGraceMs: number;
    heldQuoteMaxAgeMs: number;
  };
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
      tickMs: intEnv('MARKET_REFRESH_TICK_MS', 60 * 1000),
      // Renamed role: now the fallback cadence when a provider has no configured
      // per-capability interval. Kept the env name for backward compatibility.
      defaultIntervalMs: intEnv('MARKET_REFRESH_INTERVAL_MS', 15 * 60 * 1000),
      closeCaptureGraceMs: intEnv('MARKET_CLOSE_CAPTURE_GRACE_MS', 30 * 60 * 1000),
      heldQuoteMaxAgeMs: intEnv('MARKET_HELD_QUOTE_MAX_AGE_MS', 15 * 60 * 1000),
    },
  };
}
