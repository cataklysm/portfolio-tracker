import Fastify, { type FastifyBaseLogger, type FastifyError, type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { AppError, PROBLEM_CONTENT_TYPE, toProblemDetails } from '../problem-details.js';
import { registerHealth, type HealthChecks } from './health.js';
import { registerMetrics } from './metrics.js';

/** Current stable major HTTP API version selected via the X-API-Version header. */
export const CURRENT_API_VERSION = 1;

export interface ServiceOptions {
  name: string;
  logger: Logger;
  health: HealthChecks;
  /**
   * Once external clients consume the API, set strict mode so a missing
   * X-API-Version header is rejected rather than defaulting to the current
   * stable version.
   */
  strictApiVersion?: boolean;
}

/**
 * Builds a Fastify instance wired with the platform's cross-cutting concerns:
 * request IDs, X-API-Version negotiation, RFC 9457 problem-details errors,
 * health probes, and Prometheus metrics. Feature modules register their own
 * encapsulated plugins onto the returned instance.
 */
export function createService(options: ServiceOptions): FastifyInstance {
  // Cast the pino logger to FastifyBaseLogger so the instance keeps the default
  // logger generic; feature route modules apply the TypeBox type provider
  // locally where typed schemas are needed.
  const app = Fastify({
    loggerInstance: options.logger as unknown as FastifyBaseLogger,
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    disableRequestLogging: false,
  });

  // X-API-Version negotiation. The resolved version is echoed on the response.
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/health') || request.url === '/metrics') return;
    const raw = request.headers['x-api-version'] as string | undefined;
    if (raw === undefined) {
      if (options.strictApiVersion) {
        throw new AppError({
          status: 406,
          code: 'missing_api_version',
          title: 'Not Acceptable',
          detail: 'The X-API-Version header is required',
        });
      }
      reply.header('X-API-Version', String(CURRENT_API_VERSION));
      return;
    }
    const requested = Number.parseInt(raw, 10);
    if (Number.isNaN(requested) || requested !== CURRENT_API_VERSION) {
      throw new AppError({
        status: 406,
        code: 'unsupported_api_version',
        title: 'Not Acceptable',
        detail: `Unsupported API version "${raw}"; this service supports version ${CURRENT_API_VERSION}`,
      });
    }
    reply.header('X-API-Version', String(CURRENT_API_VERSION));
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.id;
    if (error instanceof AppError) {
      const problem = toProblemDetails(error, requestId, request.url);
      reply.code(error.status).type(PROBLEM_CONTENT_TYPE).send(problem);
      return;
    }
    // Fastify schema validation errors -> 400 with field-level detail.
    if (error.validation) {
      const appError = AppError.badRequest(
        'validation_failed',
        'Request validation failed',
        error.validation.map((v) => ({
          field: (v.instancePath || v.params?.['missingProperty'] || '') as string,
          code: v.keyword,
          message: v.message ?? 'invalid',
        })),
      );
      reply
        .code(400)
        .type(PROBLEM_CONTENT_TYPE)
        .send(toProblemDetails(appError, requestId, request.url));
      return;
    }
    // Anything else is an unexpected internal error: log it with detail, but
    // return a generic problem so internals never leak to the client.
    request.log.error({ err: error, error_code: 'internal_error' }, 'Unhandled error');
    const internal = new AppError({
      status: 500,
      code: 'internal_error',
      title: 'Internal Server Error',
      detail: 'An unexpected error occurred',
    });
    reply.code(500).type(PROBLEM_CONTENT_TYPE).send(toProblemDetails(internal, requestId, request.url));
  });

  app.setNotFoundHandler((request, reply) => {
    const problem = toProblemDetails(
      AppError.notFound('route_not_found', `No route for ${request.method} ${request.url}`),
      request.id,
      request.url,
    );
    reply.code(404).type(PROBLEM_CONTENT_TYPE).send(problem);
  });

  registerHealth(app, options.name, options.health);
  registerMetrics(app, options.name);

  return app;
}
