import type { UpstreamName } from '../config/config.js';
import type { GatewayRoute } from '../routes.js';

/** Minimal structural view of an OpenAPI 3.x document we read from upstreams. */
export interface OpenApiDocument {
  openapi: string;
  info: Record<string, unknown>;
  servers?: Array<Record<string, unknown>>;
  paths?: Record<string, OpenApiPathItem>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type OpenApiPathItem = Record<string, unknown>;

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'] as const;

const BEARER_SECURITY = [{ bearerAuth: [] as string[] }];

export interface BuildGatewaySpecArgs {
  /** The public routing table — defines which upstream paths are exposed. */
  routes: GatewayRoute[];
  /** Upstream specs by service name. Missing entries (e.g. a down upstream) are skipped. */
  upstreamSpecs: Map<UpstreamName, OpenApiDocument>;
  /** Public base URL of the gateway, used as the single `servers` entry. */
  serverUrl: string;
  version: string;
  /** Optional sink for non-fatal aggregation warnings (schema-name collisions). */
  onWarning?: (message: string) => void;
}

/**
 * Builds the gateway's OpenAPI document — the single public contract for the
 * frontend — by aggregating the upstream service specs.
 *
 * The gateway forwards each public prefix to its upstream unchanged
 * (`rewritePrefix === prefix`), so a public path equals its upstream path. For
 * every route in the table we copy the upstream operations whose path falls
 * under the prefix, attaching `bearerAuth` security to protected routes (the
 * edge requires a verified token). Upstream `/internal`, `/health`, `/metrics`
 * and `/docs` paths are never in the table, so they are excluded automatically.
 */
export function buildGatewaySpec(args: BuildGatewaySpecArgs): OpenApiDocument {
  const paths: Record<string, OpenApiPathItem> = {};
  const schemas: Record<string, unknown> = {};

  for (const route of args.routes) {
    const spec = args.upstreamSpecs.get(route.upstream);
    if (!spec) continue;

    for (const [path, item] of Object.entries(spec.paths ?? {})) {
      if (!pathMatchesPrefix(path, route.prefix)) continue;
      const cloned = structuredClone(item);
      if (route.protected) applyBearerSecurity(cloned);
      // Prefixes in the routing table are disjoint, so a path maps to exactly one
      // upstream — no cross-service path collisions are expected here.
      paths[path] = cloned;
    }

    for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) {
      if (name in schemas && args.onWarning) {
        args.onWarning(`Duplicate component schema "${name}" across upstreams; last one wins`);
      }
      schemas[name] = schema;
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Portfolio Platform API',
      description:
        'Public API exposed through the gateway. Aggregated from the upstream service specs; this is the single source of truth for clients.',
      version: args.version,
    },
    servers: [{ url: args.serverUrl }],
    paths,
    components: {
      schemas,
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  };
}

/** True when `path` is the prefix itself or sits beneath it (`/x` or `/x/...`). */
function pathMatchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function applyBearerSecurity(pathItem: OpenApiPathItem): void {
  for (const method of HTTP_METHODS) {
    const operation = pathItem[method];
    if (operation && typeof operation === 'object') {
      (operation as Record<string, unknown>)['security'] = BEARER_SECURITY;
    }
  }
}
