import { boolEnv, intEnv, optionalEnv, requireEnv } from '@portfolio/platform';

/**
 * Portfolio service configuration. The database URL is service-specific
 * (PORTFOLIO_DATABASE_URL) and falls back to the shared DATABASE_URL. The auth
 * settings point at the authentication service's JWKS for token verification.
 */
export interface PortfolioConfig {
  port: number;
  environment: string;
  serviceVersion: string;
  databaseUrl: string;
  redisUrl: string;
  /** Base URLs of the services portfolio reads from over HTTP. */
  instrumentsBaseUrl: string;
  marketBaseUrl: string;
  authBaseUrl: string;
  auth: {
    jwksUri: string;
    issuer: string;
    audience: string;
  };
  /**
   * Live position updates: tail the market quote stream and push SSE pings to
   * connected clients whose open positions were affected. Disable to drop the
   * extra Redis tail (the `/positions/stream` endpoint then returns 503).
   */
  liveQuotes: { enabled: boolean };
}

export function loadConfig(): PortfolioConfig {
  const issuer = optionalEnv('AUTH_JWT_ISSUER') ?? 'http://localhost:3002';
  return {
    port: intEnv('PORTFOLIO_PORT', 3003),
    environment: optionalEnv('NODE_ENV') ?? 'development',
    serviceVersion: optionalEnv('SERVICE_VERSION') ?? '0.1.0',
    databaseUrl: optionalEnv('PORTFOLIO_DATABASE_URL') ?? requireEnv('DATABASE_URL'),
    redisUrl: optionalEnv('VALKEY_URL') ?? optionalEnv('REDIS_URL') ?? requireEnv('VALKEY_URL'),
    instrumentsBaseUrl: optionalEnv('INSTRUMENTS_BASE_URL') ?? 'http://localhost:3004',
    marketBaseUrl: optionalEnv('MARKET_BASE_URL') ?? 'http://localhost:3005',
    authBaseUrl: optionalEnv('AUTH_BASE_URL') ?? issuer,
    auth: {
      jwksUri: optionalEnv('AUTH_JWKS_URI') ?? `${issuer}/.well-known/jwks.json`,
      issuer,
      audience: optionalEnv('AUTH_JWT_AUDIENCE') ?? 'portfolio-platform',
    },
    liveQuotes: { enabled: boolEnv('PORTFOLIO_LIVE_QUOTES_ENABLED', true) },
  };
}
