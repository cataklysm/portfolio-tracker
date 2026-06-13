import { boolEnv, intEnv, optionalEnv, requireEnv } from '@portfolio/platform';

/** Insights service configuration. Owns `insights.*` and consumes the market
 * event stream for global analyst records. */
export interface InsightsConfig {
  port: number;
  environment: string;
  serviceVersion: string;
  databaseUrl: string;
  redisUrl: string;
  /** Consume the market stream to ingest analyst assessments. */
  consumeAnalystStream: boolean;
  auth: {
    jwksUri: string;
    issuer: string;
    audience: string;
  };
}

export function loadConfig(): InsightsConfig {
  const issuer = optionalEnv('AUTH_JWT_ISSUER') ?? 'http://localhost:3002';
  return {
    port: intEnv('INSIGHTS_PORT', 3006),
    environment: optionalEnv('NODE_ENV') ?? 'development',
    serviceVersion: optionalEnv('SERVICE_VERSION') ?? '0.1.0',
    databaseUrl: optionalEnv('INSIGHTS_DATABASE_URL') ?? requireEnv('DATABASE_URL'),
    redisUrl: optionalEnv('VALKEY_URL') ?? optionalEnv('REDIS_URL') ?? requireEnv('VALKEY_URL'),
    consumeAnalystStream: boolEnv('INSIGHTS_CONSUME_ANALYST_STREAM', true),
    auth: {
      jwksUri: optionalEnv('AUTH_JWKS_URI') ?? `${issuer}/.well-known/jwks.json`,
      issuer,
      audience: optionalEnv('AUTH_JWT_AUDIENCE') ?? 'portfolio-platform',
    },
  };
}
