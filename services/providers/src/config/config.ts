import { intEnv, optionalEnv, requireEnv } from '@portfolio/platform';

/**
 * Providers service configuration. This service is the single egress to all
 * external market-data sources. Its endpoints are internal-only (network/gateway
 * restricted), so it carries no auth config. It owns one small piece of state —
 * `providers.provider_settings` (admin-editable, provider-intrinsic settings) —
 * hence the database connection.
 */
export interface ProvidersConfig {
  port: number;
  environment: string;
  serviceVersion: string;
  databaseUrl: string;
  /** Auth for the admin routes (`/admin/providers`); the `/internal/*` routes stay tokenless. */
  auth: { jwksUri: string; issuer: string; audience: string };
  ecb: {
    dailyUrl: string;
    histUrl: string;
  };
  /**
   * Lang & Schwarz TradeCenter (public chart API; no credential). Always present;
   * whether it registers/routes is gated by its `provider_settings.enabled` flag,
   * like Yahoo and ECB.
   */
  lstc: {
    baseUrl: string;
    timeoutMs: number;
    quoteType: 'mid' | 'max';
  };
}

export function loadConfig(): ProvidersConfig {
  const issuer = optionalEnv('AUTH_JWT_ISSUER') ?? 'http://localhost:3002';
  return {
    port: intEnv('PROVIDERS_PORT', 3010),
    environment: optionalEnv('NODE_ENV') ?? 'development',
    serviceVersion: optionalEnv('SERVICE_VERSION') ?? '0.1.0',
    databaseUrl: optionalEnv('PROVIDERS_DATABASE_URL') ?? requireEnv('DATABASE_URL'),
    auth: {
      jwksUri: optionalEnv('AUTH_JWKS_URI') ?? `${issuer}/.well-known/jwks.json`,
      issuer,
      audience: optionalEnv('AUTH_JWT_AUDIENCE') ?? 'portfolio-platform',
    },
    ecb: {
      dailyUrl:
        optionalEnv('ECB_DAILY_URL') ?? 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
      histUrl:
        optionalEnv('ECB_HIST_URL') ?? 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml',
    },
    lstc: {
      baseUrl: optionalEnv('LSTC_BASE_URL') ?? 'https://www.ls-tc.de',
      timeoutMs: intEnv('LSTC_TIMEOUT_MS', 8000),
      quoteType: optionalEnv('LSTC_QUOTE_TYPE') === 'max' ? 'max' : 'mid',
    },
  };
}
