import type { Logger } from '@portfolio/platform';
import { toRow, toView, type FundamentalsView } from '../domain/mapping.js';
import type {
  FundamentalsEventStore,
  FundamentalsProvider,
  FundamentalsRepository,
  PlanResolver,
} from './ports.js';

/** Admin-configured per-provider refresh cadence for the `fundamentals` capability. */
export interface RefreshGate {
  /** provider → freshness threshold (ms); absent providers fall back to `minAgeMs`. */
  intervalByProvider: Map<string, number>;
  /** providers whose fundamentals cadence is disabled — skipped entirely. */
  disabledProviders: Set<string>;
}

export interface FundamentalsServiceDeps {
  repo: FundamentalsRepository;
  provider: FundamentalsProvider;
  /** Resolves the `fundamentals` plan: each instrument → its selected provider + symbol. */
  planResolver: PlanResolver;
  events: FundamentalsEventStore;
  logger: Logger;
  /** Snapshots younger than this are considered fresh and not re-fetched. */
  minAgeMs: number;
}

/**
 * Serves stored fundamentals snapshots (never calling a provider on a read) and
 * refreshes them from the providers service on a schedule. Fundamentals are
 * per-instrument; refresh resolves the interested listings to instruments,
 * dedupes, skips instruments already refreshed within `minAgeMs`, and stores
 * the newest snapshot.
 */
export class FundamentalsService {
  constructor(private readonly deps: FundamentalsServiceDeps) {}

  /** Latest stored snapshot per requested instrument (omits ones with none). */
  async getForInstruments(instrumentIds: string[]): Promise<FundamentalsView[]> {
    if (instrumentIds.length === 0) return [];
    const stored = await this.deps.repo.getLatestForInstruments(instrumentIds);
    return [...stored.values()].map(toView);
  }

  /**
   * Refreshes fundamentals for a set of listings: resolve to instruments, dedupe,
   * skip the still-fresh ones, fetch + store the rest, emit an event each.
   * Returns the count of instruments stored. Provider/instruments failures are
   * swallowed (logged); stored data stays usable.
   *
   * `gate` carries the admin-configured per-provider cadence: `intervalByProvider`
   * overrides the freshness threshold (a provider absent falls back to `minAgeMs`),
   * and `disabledProviders` are skipped entirely. `force` ignores freshness (but
   * still honors disabled providers).
   */
  async refreshListings(listingIds: string[], force = false, gate?: RefreshGate): Promise<number> {
    if (listingIds.length === 0) return 0;
    const plan = await this.deps.planResolver.resolve('fundamentals', listingIds);

    // Dedupe to one (provider, providerSymbol, currency) per instrument; skip
    // listings with no selected fundamentals provider, no mapped symbol, or a
    // provider whose fundamentals cadence is disabled.
    const byInstrument = new Map<string, { provider: string; providerSymbol: string; currency: string }>();
    for (const entry of plan) {
      if (!entry.provider || !entry.providerSymbol) continue;
      if (gate?.disabledProviders.has(entry.provider)) continue;
      if (!byInstrument.has(entry.instrumentId)) {
        byInstrument.set(entry.instrumentId, {
          provider: entry.provider,
          providerSymbol: entry.providerSymbol,
          currency: entry.currency,
        });
      }
    }
    if (byInstrument.size === 0) return 0;

    let instrumentIds = [...byInstrument.keys()];
    if (!force) {
      // Apply the freshness gate per provider, since each provider has its own
      // configured cadence. Group this provider's instruments and select the ones
      // whose newest snapshot is older than that provider's threshold.
      const byProvider = new Map<string, string[]>();
      for (const id of instrumentIds) {
        const provider = byInstrument.get(id)!.provider;
        (byProvider.get(provider) ?? byProvider.set(provider, []).get(provider)!).push(id);
      }
      const now = Date.now();
      const stale: string[] = [];
      for (const [provider, ids] of byProvider) {
        const interval = gate?.intervalByProvider.get(provider) ?? this.deps.minAgeMs;
        const fresh = await this.deps.repo.selectStaleInstruments(ids, new Date(now - interval));
        stale.push(...fresh);
      }
      instrumentIds = stale;
    }

    let stored = 0;
    for (const instrumentId of instrumentIds) {
      const target = byInstrument.get(instrumentId);
      if (!target) continue;
      try {
        const snapshot = await this.deps.provider.fetchFundamentals(target.provider, target.providerSymbol);
        if (!snapshot) continue;
        const row = toRow(instrumentId, target.provider, snapshot);
        await this.deps.repo.upsert(row);
        await this.deps.events.enqueueSnapshotUpdated({
          instrumentId,
          currency: snapshot.currency ?? target.currency,
          effectiveDate: row.effectiveDate,
        });
        stored += 1;
      } catch (err) {
        this.deps.logger.warn(
          { err, symbol: target.providerSymbol, error_code: 'fundamentals_refresh_failed' },
          'Fundamentals refresh failed',
        );
      }
    }
    return stored;
  }
}

export type { FundamentalsView };
