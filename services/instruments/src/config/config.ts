import { intEnv, optionalEnv, requireEnv } from '@portfolio/platform';

/** Instruments service configuration. */
export interface InstrumentsConfig {
  port: number;
  environment: string;
  serviceVersion: string;
  databaseUrl: string;
  redisUrl: string;
  auth: {
    jwksUri: string;
    issuer: string;
    audience: string;
  };
}

export function loadConfig(): InstrumentsConfig {
  const issuer = optionalEnv('AUTH_JWT_ISSUER') ?? 'http://localhost:3002';
  return {
    port: intEnv('INSTRUMENTS_PORT', 3004),
    environment: optionalEnv('NODE_ENV') ?? 'development',
    serviceVersion: optionalEnv('SERVICE_VERSION') ?? '0.1.0',
    databaseUrl: optionalEnv('INSTRUMENTS_DATABASE_URL') ?? requireEnv('DATABASE_URL'),
    redisUrl: optionalEnv('VALKEY_URL') ?? optionalEnv('REDIS_URL') ?? requireEnv('VALKEY_URL'),
    auth: {
      jwksUri: optionalEnv('AUTH_JWKS_URI') ?? `${issuer}/.well-known/jwks.json`,
      issuer,
      audience: optionalEnv('AUTH_JWT_AUDIENCE') ?? 'portfolio-platform',
    },
  };
}
