import type { FastifyInstance } from 'fastify';

export interface HealthChecks {
  /**
   * Readiness probe. Should verify required dependencies (PostgreSQL, Redis),
   * required configuration, and a compatible schema version. External providers
   * such as Yahoo or ECB must never affect readiness.
   */
  ready: () => Promise<void>;
}

/**
 * Registers the standard health endpoints every service exposes:
 *   GET /health/live    — process/event loop responsive (no dependency checks)
 *   GET /health/ready    — safe to receive traffic (checks dependencies)
 *   GET /health/startup  — slow-startup / migration orchestration support
 */
export function registerHealth(app: FastifyInstance, serviceName: string, checks: HealthChecks): void {
  const opts = { logLevel: 'warn' as const };

  app.get('/health/live', opts, async () => ({ status: 'ok', service: serviceName }));

  app.get('/health/startup', opts, async (_request, reply) => {
    try {
      await checks.ready();
      return { status: 'ok', service: serviceName };
    } catch (err) {
      reply.code(503);
      return { status: 'starting', service: serviceName, reason: errorReason(err) };
    }
  });

  app.get('/health/ready', opts, async (_request, reply) => {
    try {
      await checks.ready();
      return { status: 'ok', service: serviceName };
    } catch (err) {
      reply.code(503);
      return { status: 'unavailable', service: serviceName, reason: errorReason(err) };
    }
  });
}

function errorReason(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown';
}
