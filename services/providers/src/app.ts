import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import { createDatabase, createLogger, createService, UserTokenVerifier } from '@portfolio/platform';
import type { ProvidersConfig } from './config/config.js';
import type { ProvidersDatabase } from './platform/database/schema.js';
import { buildRegistry } from './providers/registry.js';
import { ProviderSettingsRepository } from './providers/settings-repository.js';
import { CapabilityRefreshRepository } from './providers/capability-refresh-repository.js';
import { registerProviderRoutes } from './http/routes.js';

export interface BuiltService {
  app: FastifyInstance;
  shutdown: () => Promise<void>;
}

/**
 * Composition root for the providers service — the platform's single egress to
 * external market-data sources. It owns only `providers.provider_settings`
 * (admin-editable provider config); all market data is fetched live, never
 * stored here. Readiness gates on the DB; upstream provider availability is
 * reported per-request, not at the health probe.
 */
export async function buildApp(config: ProvidersConfig): Promise<BuiltService> {
  const logger = createLogger({
    service: 'providers',
    serviceVersion: config.serviceVersion,
    environment: config.environment,
    pretty: config.environment === 'development',
  });

  const { db, pool } = createDatabase<ProvidersDatabase>({ connectionString: config.databaseUrl, logger });
  const settingsRepo = new ProviderSettingsRepository(db);
  const capabilityRefreshRepo = new CapabilityRefreshRepository(db);
  const verifier = new UserTokenVerifier(config.auth);

  const registry = await buildRegistry(config, settingsRepo, logger);

  const app = createService({
    name: 'providers',
    logger,
    health: {
      ready: async () => {
        await sql`SELECT 1`.execute(db);
      },
    },
  });

  registerProviderRoutes(app, {
    registry,
    settings: settingsRepo,
    capabilityRefresh: capabilityRefreshRepo,
    authenticate: verifier.authenticate,
    requireScope: (scope) => verifier.requireScope(scope),
  });

  return {
    app,
    shutdown: async () => {
      await app.close();
      await pool.end();
    },
  };
}
