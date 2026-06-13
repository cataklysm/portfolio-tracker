import type { FastifyInstance } from 'fastify';
import { createLogger, createService } from '@portfolio/platform';
import type { ProvidersConfig } from './config/config.js';
import { buildRegistry } from './providers/registry.js';
import { registerProviderRoutes } from './http/routes.js';

export interface BuiltService {
  app: FastifyInstance;
  shutdown: () => Promise<void>;
}

/**
 * Composition root for the providers service — the platform's single egress to
 * external market-data sources. Stateless: no DB, no Redis, no auth. Health is
 * liveness only (the service is up); upstream provider availability is reported
 * per-request, not gated at the health probe.
 */
export async function buildApp(config: ProvidersConfig): Promise<BuiltService> {
  const logger = createLogger({
    service: 'providers',
    serviceVersion: config.serviceVersion,
    environment: config.environment,
    pretty: config.environment === 'development',
  });

  const registry = buildRegistry(config, logger);

  const app = createService({
    name: 'providers',
    logger,
    health: {
      ready: async () => {
        // Stateless service: ready as soon as the process is up.
      },
    },
  });

  registerProviderRoutes(app, registry);

  return {
    app,
    shutdown: async () => {
      await app.close();
    },
  };
}
