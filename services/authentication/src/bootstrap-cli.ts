/**
 * CLI wrapper for first-start setup. Container- and operator-friendly: reads
 * configuration from the environment and runs the same idempotent, advisory-
 * locked bootstrap used by the HTTP setup endpoint.
 *
 * Env:
 *   AUTH_DATABASE_URL / DATABASE_URL   Postgres connection string
 *   BOOTSTRAP_AUTH_LOCAL               'true' | 'false' (default true)
 *   BOOTSTRAP_AUTH_OIDC                'true' | 'false' (default false)
 *   BOOTSTRAP_OIDC_ISSUER / _CLIENT_ID OIDC settings (when OIDC enabled)
 *   BOOTSTRAP_ADMIN_EMAIL / _NAME / _PASSWORD   initial admin
 */
import { createLogger, createDatabase, boolEnv, optionalEnv, requireEnv } from '@portfolio/platform';
import type { AuthDatabase } from './platform/database/schema.js';
import { PasswordHasher } from './platform/security/password-hasher.js';
import { runBootstrap, type BootstrapInput } from './modules/setup/index.js';

async function main(): Promise<void> {
  const logger = createLogger({
    service: 'authentication-bootstrap',
    serviceVersion: optionalEnv('SERVICE_VERSION') ?? '0.1.0',
    environment: optionalEnv('NODE_ENV') ?? 'development',
    pretty: true,
  });

  const databaseUrl = optionalEnv('AUTH_DATABASE_URL') ?? requireEnv('DATABASE_URL');
  const input: BootstrapInput = {
    auth: {
      local: boolEnv('BOOTSTRAP_AUTH_LOCAL', true),
      oidc: boolEnv('BOOTSTRAP_AUTH_OIDC', false),
    },
    oidc:
      optionalEnv('BOOTSTRAP_OIDC_ISSUER') && optionalEnv('BOOTSTRAP_OIDC_CLIENT_ID')
        ? {
            issuerUrl: requireEnv('BOOTSTRAP_OIDC_ISSUER'),
            clientId: requireEnv('BOOTSTRAP_OIDC_CLIENT_ID'),
          }
        : undefined,
    admin: {
      email: optionalEnv('BOOTSTRAP_ADMIN_EMAIL') ?? '',
      displayName: optionalEnv('BOOTSTRAP_ADMIN_NAME'),
      password: optionalEnv('BOOTSTRAP_ADMIN_PASSWORD'),
    },
  };

  const { db, pool } = createDatabase<AuthDatabase>({ connectionString: databaseUrl, logger });
  try {
    const result = await runBootstrap(db, new PasswordHasher(), input);
    if (result.status === 'already-initialized') {
      logger.info('Instance already initialized — nothing to do.');
    } else {
      logger.info({ admin_user_id: result.adminUserId }, 'Bootstrap complete');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('[bootstrap] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
