import type { Logger } from '@portfolio/platform';
import type { UpstreamName } from '../config/config.js';
import { GATEWAY_ROUTES } from '../routes.js';
import { buildGatewaySpec, type OpenApiDocument } from './aggregate.js';

export interface GatewaySpecCacheOptions {
  upstreams: Record<UpstreamName, string>;
  /** Public base URL of the gateway, used as the spec's `servers` entry. */
  serverUrl: string;
  version: string;
  logger: Logger;
  /** How often to re-aggregate from upstreams. Default 5 min. */
  refreshIntervalMs?: number;
  /** Per-upstream fetch timeout. Default 3 s. */
  fetchTimeoutMs?: number;
}

/**
 * Holds the gateway's aggregated OpenAPI document and keeps it fresh by polling
 * each upstream's `/openapi.json` in the background. Refreshes run as detached
 * async tasks (network I/O on the event loop — never blocking request handling),
 * so `getDocument()` always returns the last successfully built spec instantly.
 * The first refresh is kicked off at `start()` but not awaited, so a slow or
 * unreachable upstream never delays gateway startup.
 */
export class GatewaySpecCache {
  private document: OpenApiDocument;
  private timer: NodeJS.Timeout | undefined;
  private readonly refreshIntervalMs: number;
  private readonly fetchTimeoutMs: number;
  /** Distinct upstreams referenced by the routing table. */
  private readonly upstreamNames: UpstreamName[];

  constructor(private readonly options: GatewaySpecCacheOptions) {
    this.refreshIntervalMs = options.refreshIntervalMs ?? 5 * 60 * 1000;
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? 3000;
    this.upstreamNames = [...new Set(GATEWAY_ROUTES.map((route) => route.upstream))];
    // Seed with an empty-but-valid document so the endpoint works before the
    // first refresh completes.
    this.document = buildGatewaySpec({
      routes: GATEWAY_ROUTES,
      upstreamSpecs: new Map(),
      serverUrl: options.serverUrl,
      version: options.version,
    });
  }

  getDocument(): OpenApiDocument {
    return this.document;
  }

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.refreshIntervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * Re-fetches every upstream spec concurrently and rebuilds the document. If
   * all upstreams fail the previous document is kept; partial failures simply
   * omit that upstream's paths until it recovers.
   */
  async refresh(): Promise<void> {
    const results = await Promise.all(
      this.upstreamNames.map(async (name) => [name, await this.fetchSpec(name)] as const),
    );

    const specs = new Map<UpstreamName, OpenApiDocument>();
    for (const [name, spec] of results) {
      if (spec) specs.set(name, spec);
    }

    if (specs.size === 0) {
      this.options.logger.warn(
        { error_code: 'openapi_aggregate_empty' },
        'No upstream OpenAPI specs reachable; keeping previous gateway spec',
      );
      return;
    }

    this.document = buildGatewaySpec({
      routes: GATEWAY_ROUTES,
      upstreamSpecs: specs,
      serverUrl: this.options.serverUrl,
      version: this.options.version,
      onWarning: (message) =>
        this.options.logger.warn({ error_code: 'openapi_aggregate_warning' }, message),
    });

    if (specs.size < this.upstreamNames.length) {
      this.options.logger.info(
        { error_code: 'openapi_aggregate_partial', reachable: specs.size, total: this.upstreamNames.length },
        'Aggregated gateway spec from a subset of upstreams',
      );
    }
  }

  private async fetchSpec(name: UpstreamName): Promise<OpenApiDocument | undefined> {
    const url = `${this.options.upstreams[name]}/openapi.json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        this.options.logger.warn(
          { error_code: 'openapi_fetch_failed', upstream: name, status: response.status },
          'Upstream OpenAPI fetch returned non-2xx',
        );
        return undefined;
      }
      return (await response.json()) as OpenApiDocument;
    } catch (err) {
      this.options.logger.warn(
        { err, error_code: 'openapi_fetch_error', upstream: name },
        'Upstream OpenAPI fetch failed',
      );
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }
}
