/**
 * Build-time OpenAPI 3.1 export.
 *
 * Boots each domain service's Fastify app in spec-only mode and writes the
 * generated document to documentation/openapi/<service>.json. No live Postgres
 * or Redis is required: the pg pool connects lazily and is never queried, the
 * OPENAPI_DUMP flag short-circuits the Redis connection and the outbox worker,
 * and the per-service background schedulers/consumers are disabled via env so
 * nothing reaches out over the network. The app is only asked for its route
 * table (`app.swagger()`), then closed.
 *
 * Run: `pnpm openapi:dump`
 *
 * The gateway spec is built last by aggregating the just-generated upstream
 * specs through the public routing table (the same logic the gateway uses at
 * runtime), so gateway.json is the single public contract for the frontend.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GATEWAY_ROUTES } from '../services/gateway/src/routes.js';
import { buildGatewaySpec, type OpenApiDocument } from '../services/gateway/src/openapi/aggregate.js';
import type { UpstreamName } from '../services/gateway/src/config/config.js';

// Structural subset of the Fastify instance the dump needs. Avoids a root-level
// dependency on fastify (it lives in the service workspaces, not here).
interface SwaggerApp {
  ready: () => Promise<unknown>;
  swagger: () => unknown;
}

// Must be set before any service module is imported (config is read eagerly).
process.env['OPENAPI_DUMP'] = '1';
process.env['NODE_ENV'] ??= 'production';
process.env['DATABASE_URL'] ??= 'postgres://openapi:openapi@127.0.0.1:5432/openapi';
process.env['VALKEY_URL'] ??= 'redis://127.0.0.1:6379';
// Keep every background worker dormant; we only need the HTTP route table.
process.env['FUNDAMENTALS_REFRESH_ENABLED'] = 'false';
process.env['EVENTS_REFRESH_ENABLED'] = 'false';
process.env['MARKET_REFRESH_ENABLED'] = 'false';
process.env['NOTIFICATIONS_EVAL_ENABLED'] = 'false';
process.env['NOTIFICATIONS_CONSUME_INTEREST_STREAM'] = 'false';
process.env['INSIGHTS_CONSUME_ANALYST_STREAM'] = 'false';

interface BuiltService {
  app: SwaggerApp;
  shutdown: () => Promise<void>;
}

type ServiceModule = {
  buildApp: (config: unknown) => Promise<BuiltService>;
  loadConfig: () => unknown;
};

const SERVICES = [
  'authentication',
  'instruments',
  'providers',
  'market',
  'fundamentals',
  'events',
  'notifications',
  'portfolio',
  'insights',
] as const;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'documentation', 'openapi');

async function writeSpec(name: string, document: unknown): Promise<void> {
  const pathCount = Object.keys((document as { paths?: Record<string, unknown> }).paths ?? {}).length;
  await writeFile(join(outDir, `${name}.json`), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.log(`[openapi] ${name}: ${pathCount} paths -> documentation/openapi/${name}.json`);
}

async function dumpService(name: string): Promise<OpenApiDocument> {
  // tsx resolves the .js specifiers to the .ts sources, matching the repo's
  // import convention.
  const app = (await import(`../services/${name}/src/app.js`)) as ServiceModule;
  const config = (await import(`../services/${name}/src/config/config.js`)) as ServiceModule;

  const built = await app.buildApp(config.loadConfig());
  try {
    await built.app.ready();
    const document = built.app.swagger() as OpenApiDocument;
    await writeSpec(name, document);
    return document;
  } finally {
    // Never connected to infra in dump mode; ignore teardown errors (e.g.
    // closing an unopened Redis client).
    await built.shutdown().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const upstreamSpecs = new Map<UpstreamName, OpenApiDocument>();
  for (const name of SERVICES) {
    upstreamSpecs.set(name, await dumpService(name));
  }

  // Aggregate the gateway spec from the upstream specs we just generated, using
  // the same routing table the gateway applies at runtime.
  const gateway = buildGatewaySpec({
    routes: GATEWAY_ROUTES,
    upstreamSpecs,
    serverUrl: process.env['GATEWAY_PUBLIC_URL'] ?? 'http://localhost:3001',
    version: process.env['SERVICE_VERSION'] ?? '0.1.0',
    onWarning: (message) => console.warn(`[openapi] gateway: ${message}`),
  });
  await writeSpec('gateway', gateway);

  console.log(`[openapi] wrote ${SERVICES.length + 1} specs to documentation/openapi/`);
  // Background timers in some services are unref'd but a clean, prompt exit is
  // preferable for a one-shot build step.
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('[openapi] dump failed:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
