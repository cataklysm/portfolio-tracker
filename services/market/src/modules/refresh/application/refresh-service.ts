import type { EventEnvelope, Logger } from '@portfolio/platform';
import type { QuoteService } from '../../quotes/index.js';
import type { FxService } from '../../fx/index.js';
import type { AnalystService } from '../../analyst/index.js';
import type { RefreshInterestRepository } from './ports.js';

interface InterestPayload {
  listing_id?: string;
}

export interface RefreshServiceDeps {
  interests: RefreshInterestRepository;
  quotes: QuoteService;
  fx: FxService;
  analyst?: AnalystService;
  logger: Logger;
  intervalMs: number;
  chunkSize?: number;
}

/**
 * Maintains the consolidated refresh-interest projection from portfolio events
 * and runs the refresh cycle. Consolidating per listing means multiple
 * interested users never cause duplicate provider requests.
 */
export class RefreshService {
  private readonly chunkSize: number;

  constructor(private readonly deps: RefreshServiceDeps) {
    this.chunkSize = deps.chunkSize ?? 25;
  }

  /** Idempotent handler for portfolio interest events from the stream. */
  async applyInterestEvent(envelope: EventEnvelope): Promise<void> {
    const payload = envelope.payload as InterestPayload;
    const listingId = payload.listing_id;
    if (!listingId) return; // not an interest-bearing event

    const mapping: Record<string, { type: 'position' | 'watchlist'; active: boolean } | undefined> = {
      'portfolio.position.opened': { type: 'position', active: true },
      'portfolio.position.closed': { type: 'position', active: false },
      'portfolio.watchlist.added': { type: 'watchlist', active: true },
      'portfolio.watchlist.removed': { type: 'watchlist', active: false },
    };
    const change = mapping[envelope.event_type];
    if (!change) return;

    await this.deps.interests.upsertInterest({
      interestId: envelope.aggregate.id,
      listingId,
      interestType: change.type,
      active: change.active,
      aggregateVersion: envelope.aggregate.version,
    });
  }

  /** One refresh cycle: refresh all listings with active interest, plus FX. */
  async runCycle(): Promise<void> {
    try {
      await this.deps.fx.refreshDaily();
    } catch (err) {
      this.deps.logger.warn({ err, error_code: 'fx_refresh_failed' }, 'FX refresh failed');
    }

    const listingIds = await this.deps.interests.listActiveListingIds();
    const nextDue = new Date(Date.now() + this.deps.intervalMs);
    for (const chunk of chunked(listingIds, this.chunkSize)) {
      try {
        await this.deps.quotes.refreshLatest(chunk);
        await this.deps.interests.recordRefresh(chunk, 'yahoo', nextDue);
      } catch (err) {
        this.deps.logger.warn({ err, error_code: 'quote_refresh_failed' }, 'Quote refresh chunk failed');
      }
      if (this.deps.analyst) {
        try {
          await this.deps.analyst.refreshForListings(chunk);
        } catch (err) {
          this.deps.logger.warn({ err, error_code: 'analyst_refresh_failed' }, 'Analyst refresh chunk failed');
        }
      }
    }
  }
}

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
