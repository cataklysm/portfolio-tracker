import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import httpProxy, { type FastifyHttpProxyOptions } from '@fastify/http-proxy';
import {
  AppError,
  createLogger,
  createService,
  PROBLEM_CONTENT_TYPE,
  toProblemDetails,
  UserTokenVerifier,
} from '@portfolio/platform';
import type { GatewayConfig } from './config/config.js';
import { GATEWAY_ROUTES } from './routes.js';
import { GatewaySpecCache } from './openapi/spec-cache.js';

export interface BuiltService {
  app: FastifyInstance;
  shutdown: () => Promise<void>;
}

/**
 * Composition root for the API gateway: the single public edge. It verifies
 * tokens at the edge, applies CORS / security headers / rate limiting, and
 * reverse-proxies public routes to the owning service. Only the routes in the
 * routing table are exposed; upstream internal/health/metrics endpoints are
 * unreachable through the gateway.
 */
export async function buildApp(config: GatewayConfig): Promise<BuiltService> {
  const logger = createLogger({
    service: 'gateway',
    serviceVersion: config.serviceVersion,
    environment: config.environment,
    pretty: config.environment === 'development',
  });

  // The gateway's public contract is the union of its upstreams, not its proxy
  // routes, so it serves a live-aggregated spec (external-document mode) kept
  // fresh in the background.
  const specCache = new GatewaySpecCache({
    upstreams: config.upstreams,
    serverUrl: config.publicUrl,
    version: config.serviceVersion,
    logger,
    refreshIntervalMs: config.openapiRefreshMs,
  });

  const app = await createService({
    name: 'gateway',
    logger,
    health: { ready: async () => undefined },
    openapi: { document: () => specCache.getDocument() },
  });

  specCache.start();

  const verifier = new UserTokenVerifier(config.auth);

  await app.register(cors, { origin: config.cors.origins, credentials: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: config.rateLimit.max, timeWindow: config.rateLimit.timeWindowMs });

  // Propagate a correlation id to upstreams when the client did not supply one.
  app.addHook('onRequest', async (request) => {
    if (!request.headers['x-request-id']) request.headers['x-request-id'] = request.id;
  });

  const replyOptions: FastifyHttpProxyOptions['replyOptions'] = {
    onError: (reply, details) => {
      reply.log.error({ err: details.error, error_code: 'upstream_unavailable' }, 'Upstream proxy error');
      const problem = toProblemDetails(
        new AppError({
          status: 502,
          code: 'upstream_unavailable',
          title: 'Bad Gateway',
          detail: 'The upstream service is unavailable',
        }),
        reply.request.id,
        reply.request.url,
      );
      void reply.code(502).type(PROBLEM_CONTENT_TYPE).send(problem);
    },
  };

  // Edge token verification: reject anonymous requests on protected routes
  // before forwarding. The token is passed through; downstreams validate again.
  const edgeAuth: FastifyHttpProxyOptions['preHandler'] = async (request) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw AppError.unauthorized('missing_bearer_token', 'A bearer token is required');
    }
    try {
      await verifier.verify(header.slice(7));
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.unauthorized('invalid_token', 'The access token is invalid or expired');
    }
  };

  for (const route of GATEWAY_ROUTES) {
    await app.register(httpProxy, {
      upstream: config.upstreams[route.upstream],
      prefix: route.prefix,
      rewritePrefix: route.prefix,
      replyOptions,
      ...(route.protected ? { preHandler: edgeAuth } : {}),
    });
  }

  return {
    app,
    shutdown: async () => {
      specCache.stop();
      await app.close();
    },
  };
}
