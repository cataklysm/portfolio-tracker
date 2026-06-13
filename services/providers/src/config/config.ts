import { intEnv, optionalEnv } from '@portfolio/platform';

/**
 * Providers service configuration. This service is the single egress to all
 * external market-data sources; it is stateless (no DB, no Redis) and its
 * endpoints are internal-only (network/gateway restricted), so it carries no
 * auth config either.
 */
export interface ProvidersConfig {
  port: number;
  environment: string;
  serviceVersion: string;
  ecb: {
    dailyUrl: string;
    histUrl: string;
  };
}

export function loadConfig(): ProvidersConfig {
  return {
    port: intEnv('PROVIDERS_PORT', 3010),
    environment: optionalEnv('NODE_ENV') ?? 'development',
    serviceVersion: optionalEnv('SERVICE_VERSION') ?? '0.1.0',
    ecb: {
      dailyUrl:
        optionalEnv('ECB_DAILY_URL') ?? 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
      histUrl:
        optionalEnv('ECB_HIST_URL') ?? 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml',
    },
  };
}
