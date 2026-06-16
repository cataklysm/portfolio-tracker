import type { Logger } from '@portfolio/platform';
import { toRow, toView, type FundamentalsView } from '../domain/mapping.js';
import type {
  FundamentalsEventStore,
  FundamentalsProvider,
  FundamentalsRepository,
  PlanResolver,
} from './ports.js';

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
   */
  async refreshListings(listingIds: string[], force = false): Promise<number> {
    if (listingIds.length === 0) return 0;
    const plan = await this.deps.planResolver.resolve('fundamentals', listingIds);

    // Dedupe to one (provider, providerSymbol, currency) per instrument; skip
    // listings with no selected fundamentals provider or no mapped symbol.
    const byInstrument = new Map<string, { provider: string; providerSymbol: string; currency: string }>();
    for (const entry of plan) {
      if (!entry.provider || !entry.providerSymbol) continue;
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
      const before = new Date(Date.now() - this.deps.minAgeMs);
      instrumentIds = await this.deps.repo.selectStaleInstruments(instrumentIds, before);
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
