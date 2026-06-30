import type { Logger } from '@portfolio/platform';
import type { ProviderSettingsRepository } from './settings-repository.js';

/** Effective pacing for one provider. `rateLimitPerMin` null = unthrottled. */
interface Limits {
  maxConcurrency: number;
  rateLimitPerMin: number | null;
}

interface ProviderState {
  /** Outbound calls currently in flight. */
  active: number;
  /** Resolvers waiting for a concurrency slot (FIFO). */
  queue: Array<() => void>;
  /** Token-bucket balance; Infinity until a rate limit first applies. */
  tokens: number;
  lastRefillMs: number;
  /** Serializes token acquisition so the rate limit spaces calls deterministically. */
  tokenChain: Promise<void>;
}

const DEFAULT_CONCURRENCY = 4;

/**
 * Per-provider egress pacing: a concurrency semaphore plus an optional
 * token-bucket rate limit, applied to every outbound provider call so the whole
 * platform respects each provider's admin-configured limits. Limits are read from
 * `provider_settings` with a short TTL cache, so admin edits take effect without
 * a restart. A single instance is shared across all requests in the service.
 */
export class ProviderPacing {
  private readonly state = new Map<string, ProviderState>();
  private limits = new Map<string, Limits>();
  private limitsLoadedMs = 0;
  private inflightLoad: Promise<void> | null = null;

  constructor(
    private readonly settings: ProviderSettingsRepository,
    private readonly logger: Logger,
    private readonly ttlMs = 15_000,
  ) {}

  /** Runs `fn` once a rate token and a concurrency slot for `provider` are available. */
  async run<T>(provider: string, fn: () => Promise<T>): Promise<T> {
    const limits = await this.limitsFor(provider);
    await this.acquireToken(provider, limits.rateLimitPerMin);
    await this.acquireSlot(provider, limits.maxConcurrency);
    try {
      return await fn();
    } finally {
      this.releaseSlot(provider, limits.maxConcurrency);
    }
  }

  private stateFor(provider: string): ProviderState {
    let s = this.state.get(provider);
    if (!s) {
      s = { active: 0, queue: [], tokens: Number.POSITIVE_INFINITY, lastRefillMs: Date.now(), tokenChain: Promise.resolve() };
      this.state.set(provider, s);
    }
    return s;
  }

  private async limitsFor(provider: string): Promise<Limits> {
    await this.refreshLimits();
    return this.limits.get(provider) ?? { maxConcurrency: DEFAULT_CONCURRENCY, rateLimitPerMin: null };
  }

  /** Reloads all provider limits from the DB at most once per TTL (deduped). */
  private refreshLimits(): Promise<void> {
    if (Date.now() - this.limitsLoadedMs < this.ttlMs) return Promise.resolve();
    if (this.inflightLoad) return this.inflightLoad;
    this.inflightLoad = (async () => {
      try {
        const next = new Map<string, Limits>();
        for (const s of await this.settings.listAll()) {
          next.set(s.provider, { maxConcurrency: s.maxConcurrency, rateLimitPerMin: s.rateLimitPerMin });
        }
        this.limits = next;
        this.limitsLoadedMs = Date.now();
      } catch (err) {
        this.logger.warn({ err, error_code: 'provider_pacing_settings_failed' }, 'Provider pacing settings load failed');
        // Keep stale limits; retry soon rather than every call.
        this.limitsLoadedMs = Date.now() - this.ttlMs + 2_000;
      } finally {
        this.inflightLoad = null;
      }
    })();
    return this.inflightLoad;
  }

  // --- Concurrency semaphore -------------------------------------------------

  private acquireSlot(provider: string, max: number): Promise<void> {
    const s = this.stateFor(provider);
    return new Promise<void>((resolve) => {
      s.queue.push(resolve);
      this.pump(provider, max);
    });
  }

  private pump(provider: string, max: number): void {
    const s = this.stateFor(provider);
    const limit = Math.max(1, max);
    while (s.active < limit && s.queue.length > 0) {
      s.active += 1;
      (s.queue.shift() as () => void)();
    }
  }

  private releaseSlot(provider: string, max: number): void {
    const s = this.stateFor(provider);
    s.active = Math.max(0, s.active - 1);
    this.pump(provider, max);
  }

  // --- Token-bucket rate limit ----------------------------------------------

  private acquireToken(provider: string, perMin: number | null): Promise<void> {
    if (!perMin || perMin <= 0) return Promise.resolve();
    const s = this.stateFor(provider);
    const next = s.tokenChain.then(() => this.takeToken(s, perMin));
    // Keep the chain alive even if a take rejects (it shouldn't).
    s.tokenChain = next.catch(() => undefined);
    return next;
  }

  private async takeToken(s: ProviderState, perMin: number): Promise<void> {
    const ratePerMs = perMin / 60_000;
    const refill = (): void => {
      const now = Date.now();
      const base = Number.isFinite(s.tokens) ? s.tokens : perMin;
      s.tokens = Math.min(perMin, base + (now - s.lastRefillMs) * ratePerMs);
      s.lastRefillMs = now;
    };
    refill();
    if (s.tokens >= 1) {
      s.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil((1 - s.tokens) / ratePerMs);
    await delay(waitMs);
    refill();
    s.tokens = Math.max(0, s.tokens - 1);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
