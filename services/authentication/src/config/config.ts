import { intEnv, optionalEnv, requireEnv } from '@portfolio/platform';

/**
 * Authentication service configuration. The database URL is service-specific
 * (AUTH_DATABASE_URL) and falls back to the shared DATABASE_URL used in the
 * default single-database deployment.
 */
export interface AuthConfig {
  port: number;
  environment: string;
  serviceVersion: string;
  databaseUrl: string;
  /** Shared secret guarding POST /auth/setup; if unset the endpoint is disabled. */
  setupSecret: string | undefined;
  jwt: {
    privateKeyPem: string | undefined;
    keyId: string;
    issuer: string;
    audience: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
  };
  lockout: {
    maxFailedAttempts: number;
    durationMs: number;
  };
}

export function loadConfig(): AuthConfig {
  return {
    port: intEnv('AUTH_PORT', 3002),
    environment: optionalEnv('NODE_ENV') ?? 'development',
    serviceVersion: optionalEnv('SERVICE_VERSION') ?? '0.1.0',
    databaseUrl: optionalEnv('AUTH_DATABASE_URL') ?? requireEnv('DATABASE_URL'),
    setupSecret: optionalEnv('AUTH_SETUP_SECRET'),
    jwt: {
      privateKeyPem: optionalEnv('AUTH_JWT_PRIVATE_KEY'),
      keyId: optionalEnv('AUTH_JWT_KEY_ID') ?? 'auth-1',
      issuer: optionalEnv('AUTH_JWT_ISSUER') ?? 'http://localhost:3002',
      audience: optionalEnv('AUTH_JWT_AUDIENCE') ?? 'portfolio-platform',
      accessTokenTtlSeconds: intEnv('AUTH_ACCESS_TOKEN_TTL_SECONDS', 15 * 60),
      refreshTokenTtlSeconds: intEnv('AUTH_REFRESH_TOKEN_TTL_SECONDS', 30 * 24 * 60 * 60),
    },
    lockout: {
      maxFailedAttempts: intEnv('AUTH_MAX_FAILED_ATTEMPTS', 5),
      durationMs: intEnv('AUTH_LOCKOUT_MINUTES', 15) * 60 * 1000,
    },
  };
}
