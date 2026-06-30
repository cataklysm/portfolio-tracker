import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { QuoteService } from './quote-service.js';
import type {
  NormalizedQuote,
  PlanListing,
  PriceRanges,
  ProviderQuote,
  QuoteProvider,
  QuoteRepository,
  StoredQuotePair,
  DailyClose,
} from './ports.js';

/** In-memory repo that records every upserted quote and supports purge. */
class FakeRepo implements QuoteRepository {
  rows: NormalizedQuote[] = [];
  purged: string[] = [];
  async getLatestPairs(): Promise<Map<string, StoredQuotePair>> {
    return new Map();
  }
  async getSeries(): Promise<{ time: Date; price: string; volume: string | null }[]> {
    return [];
  }
  async getDailyCloseSeries(): Promise<DailyClose[]> {
    return [];
  }
  async getPriceRanges(): Promise<PriceRanges> {
    const empty = { high: null, low: null, highAt: null, lowAt: null };
    return { currency: null, asOf: new Date(), daily: empty, weekly: empty, monthly: empty, yearly: empty };
  }
  async upsertQuote(quote: NormalizedQuote): Promise<void> {
    this.rows.push(quote);
  }
  async purgeListings(listingIds: string[]): Promise<number> {
    this.purged.push(...listingIds);
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !listingIds.includes(r.listingId));
    return before - this.rows.length;
  }
  async purgeListingsSince(listingIds: string[], since: Date): Promise<number> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(listingIds.includes(r.listingId) && r.time.getTime() >= since.getTime()));
    return before - this.rows.length;
  }
}

/** Provider stub: daily series for fetchQuote (chart), intraday series for fetchQuotes. */
class FakeProvider implements QuoteProvider {
  async fetchQuote(): Promise<ProviderQuote | null> {
    return {
      price: '65.11',
      previousClose: '64.0',
      currency: 'EUR',
      timestampMs: Date.parse('2026-06-26T14:38:50Z'),
      series: [
        { timeMs: Date.parse('2026-06-25T00:00:00Z'), close: '64.0', volume: null },
        { timeMs: Date.parse('2026-06-26T00:00:00Z'), close: '65.11', volume: null },
      ],
    };
  }
  async fetchQuotes(_provider: string, symbols: string[]): Promise<Map<string, ProviderQuote>> {
    const out = new Map<string, ProviderQuote>();
    for (const symbol of symbols) {
      out.set(symbol, {
        price: '65.15',
        previousClose: '64.0',
        currency: 'EUR',
        timestampMs: Date.parse('2026-06-26T14:38:00Z'),
        series: [
          { timeMs: Date.parse('2026-06-26T14:37:00Z'), close: '65.10', volume: null },
          { timeMs: Date.parse('2026-06-26T14:38:00Z'), close: '65.15', volume: null },
        ],
      });
    }
    return out;
  }
}

function planListing(listingId: string): PlanListing {
  return { listingId, instrumentId: `instr-${listingId}`, symbol: '41939', currency: 'EUR', provider: 'lstc', providerSymbol: '41939' };
}

describe('QuoteService.purgeAndRebuild includeIntraday', () => {
  let repo: FakeRepo;
  let service: QuoteService;

  beforeEach(() => {
    repo = new FakeRepo();
    service = new QuoteService({
      repo,
      provider: new FakeProvider(),
      planResolver: { resolve: async (_cap, ids) => (ids ?? ['L1']).map(planListing) },
      staleAfterMs: 60_000,
    });
  });

  test('without include_intraday: daily series only (no minute bars)', async () => {
    const result = await service.purgeAndRebuild(['L1']);
    assert.equal(result.intraday, 0);
    // None of the intraday-series bars (exact timestamps) were stored. The daily
    // latest tick at 14:38:50Z is expected and distinct from the 14:38:00Z bar.
    const times = repo.rows.map((r) => r.time.toISOString());
    assert.ok(!times.includes('2026-06-26T14:37:00.000Z'));
    assert.ok(!times.includes('2026-06-26T14:38:00.000Z'));
  });

  test('with include_intraday: also stores the current session minute bars', async () => {
    const result = await service.purgeAndRebuild(['L1'], undefined, { includeIntraday: true });
    assert.equal(result.intraday, 1);
    const times = repo.rows.map((r) => r.time.toISOString());
    assert.ok(times.includes('2026-06-26T14:37:00.000Z'), 'has first intraday bar');
    assert.ok(times.includes('2026-06-26T14:38:00.000Z'), 'has last intraday bar');
  });

  test('purge runs before the rebuild repopulates', async () => {
    repo.rows.push({
      listingId: 'L1',
      time: new Date('2026-06-26T16:38:00Z'), // a stale +2h bad row
      provider: 'lstc',
      price: '99',
      volume: null,
      currency: 'EUR',
      providerTimestamp: null,
    });
    await service.purgeAndRebuild(['L1'], undefined, { includeIntraday: true });
    assert.ok(repo.purged.includes('L1'));
    // The bad future-stamped row is gone.
    assert.equal(repo.rows.some((r) => r.price === '99'), false);
  });
});

describe('QuoteService.purgeAndRebuildIntraday', () => {
  let repo: FakeRepo;
  let service: QuoteService;

  beforeEach(() => {
    repo = new FakeRepo();
    service = new QuoteService({
      repo,
      provider: new FakeProvider(),
      planResolver: { resolve: async (_cap, ids) => (ids ?? ['L1']).map(planListing) },
      staleAfterMs: 60_000,
    });
  });

  test('deletes only the current session and repopulates from the intraday feed', async () => {
    // Prior day's close (must survive) + a bad +2h current-session row (must go).
    repo.rows.push(
      { listingId: 'L1', time: new Date('2026-06-25T00:00:00Z'), provider: 'lstc', price: '64.0', volume: null, currency: 'EUR', providerTimestamp: null },
      { listingId: 'L1', time: new Date('2026-06-26T16:38:00Z'), provider: 'lstc', price: '99', volume: null, currency: 'EUR', providerTimestamp: null },
    );

    const result = await service.purgeAndRebuildIntraday(['L1']);
    assert.equal(result.intraday, 1);
    assert.ok(result.purged >= 1);

    const times = repo.rows.map((r) => r.time.toISOString());
    // Prior day survives.
    assert.ok(times.includes('2026-06-25T00:00:00.000Z'));
    // Bad future-stamped row is gone; fresh session bars are in.
    assert.equal(repo.rows.some((r) => r.price === '99'), false);
    assert.ok(times.includes('2026-06-26T14:37:00.000Z'));
    assert.ok(times.includes('2026-06-26T14:38:00.000Z'));
  });

  test('no-op delete when the feed returns no intraday series', async () => {
    class EmptyProvider extends FakeProvider {
      override async fetchQuotes(): Promise<Map<string, ProviderQuote>> {
        return new Map();
      }
    }
    service = new QuoteService({
      repo,
      provider: new EmptyProvider(),
      planResolver: { resolve: async (_cap, ids) => (ids ?? ['L1']).map(planListing) },
      staleAfterMs: 60_000,
    });
    repo.rows.push({ listingId: 'L1', time: new Date('2026-06-26T10:00:00Z'), provider: 'lstc', price: '50', volume: null, currency: 'EUR', providerTimestamp: null });

    const result = await service.purgeAndRebuildIntraday(['L1']);
    assert.deepEqual(result, { purged: 0, intraday: 0 });
    // Nothing deleted when there is no fresh session to replace it with.
    assert.equal(repo.rows.length, 1);
  });
});
