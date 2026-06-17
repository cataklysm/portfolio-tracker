import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { stringify as stringifyYaml } from 'yaml';

/** Route option that keeps an endpoint out of the generated OpenAPI document. */
export const HIDE_FROM_OPENAPI = { hide: true } as const;

export interface OpenApiOptions {
  /**
   * External-document mode. When provided, the service serves this pre-built
   * document at /openapi.json and /docs instead of generating one from its own
   * routes. The function is called per request, so the returned document may
   * change over time (e.g. the gateway's live-aggregated spec). Used by the
   * gateway, whose real contract is the union of its upstreams, not its proxy
   * routes.
   */
  document?: () => unknown;
}

/**
 * Registers OpenAPI 3.1 generation for the service. The TypeBox schemas attached
 * to each route are JSON Schema (draft 2020-12) already, which aligns with the
 * OpenAPI 3.1 schema dialect, so `@fastify/swagger` emits them verbatim — no
 * separate spec is maintained by hand.
 *
 * Exposes the document at `GET /openapi.json` and `GET /openapi.yaml` and an
 * interactive Swagger UI at `/docs`. Must be registered before any documented
 * routes so the plugin's `onRoute` hook captures them; `createService` calls it
 * before the feature modules register their routes.
 */
export async function registerOpenApi(
  app: FastifyInstance,
  serviceName: string,
  options?: OpenApiOptions,
): Promise<void> {
  const external = options?.document;

  // Awaited so the plugin is fully loaded before the caller registers feature
  // routes; @fastify/swagger captures routes via an onRoute hook that only fires
  // for routes added after the plugin has executed. In external mode the plugin
  // is still registered to satisfy @fastify/swagger-ui's plugin dependency; its
  // generated output is unused (the UI points at /openapi.json instead).
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: `${serviceName} API`,
        description: `Internal HTTP API for the ${serviceName} service.`,
        version: process.env['SERVICE_VERSION'] ?? '0.1.0',
      },
      components: {
        securitySchemes: {
          // Most endpoints expect a short-lived access token (validated against
          // the auth service JWKS). Per-route scope requirements can be layered
          // on later via each route's schema; this only declares the scheme.
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    logLevel: 'warn',
    // Point the UI at our own /openapi.json so it reflects the live document
    // rather than @fastify/swagger's cached (frozen-after-first-call) output.
    ...(external ? { uiConfig: { url: '/openapi.json' } } : {}),
  });

  app.get('/openapi.json', { schema: HIDE_FROM_OPENAPI, logLevel: 'warn' }, async () =>
    external ? external() : app.swagger(),
  );

  app.get('/openapi.yaml', { schema: HIDE_FROM_OPENAPI, logLevel: 'warn' }, async (_request, reply) => {
    void reply.type('application/yaml');
    return external ? stringifyYaml(external()) : app.swagger({ yaml: true });
  });
}
