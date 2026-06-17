import { Registry, collectDefaultMetrics, Histogram, Counter } from 'prom-client';
import type { FastifyInstance } from 'fastify';

/**
 * Registers Prometheus-compatible metrics: process defaults plus HTTP request
 * count and latency by route template and status. Route templates (not raw
 * URLs) are used as labels, and user/listing IDs are deliberately excluded to
 * keep label cardinality bounded.
 */
export function registerMetrics(app: FastifyInstance, serviceName: string): void {
  const registry = new Registry();
  registry.setDefaultLabels({ service: serviceName });
  collectDefaultMetrics({ register: registry });

  const httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });
  const httpErrors = new Counter({
    name: 'http_request_errors_total',
    help: 'Count of HTTP responses with status >= 500',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unknown';
    const labels = {
      method: request.method,
      route,
      status: String(reply.statusCode),
    };
    httpDuration.observe(labels, reply.elapsedTime / 1000);
    if (reply.statusCode >= 500) httpErrors.inc(labels);
  });

  app.get('/metrics', { logLevel: 'warn', schema: { hide: true } }, async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
}
