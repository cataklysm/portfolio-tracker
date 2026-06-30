import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { LstcClient, LstcSeries } from './clients/lstc-client.js';
import { LstcProvider } from './lstc-provider.js';

/** A minimal stub returning canned series for getIntraday/getHistory. */
function stubClient(parts: { intraday?: LstcSeries | null; history?: LstcSeries | null }): LstcClient {
  return {
    getIntraday: async () => parts.intraday ?? null,
    getHistory: async () => parts.history ?? null,
  } as unknown as LstcClient;
}

describe('LstcProvider.fetchQuotes timestamp normalization', () => {
  test('shifts intraday wall-clock timestamps to real UTC (summer = -2h)', async () => {
    const provider = new LstcProvider(
      stubClient({
        intraday: {
          points: [
            { timeMs: 1781593680000, price: 70.47 },
            { timeMs: 1781593740000, price: 70.46 },
          ],
          previousClose: 70.48,
        },
      }),
    );
    const quotes = await provider.fetchQuotes(['41939']);
    const quote = quotes.get('41939');
    assert.ok(quote);
    assert.equal(quote.timestampMs, 1781586540000); // last point, -2h
    assert.deepEqual(
      quote.series?.map((p) => p.timeMs),
      [1781586480000, 1781586540000],
    );
  });

  test('leaves the daily-history fallback timestamp untouched (UTC-anchored close)', async () => {
    const provider = new LstcProvider(
      stubClient({
        intraday: { points: [], previousClose: null },
        history: { points: [{ timeMs: 1781536000000, price: 71.1 }], previousClose: 70.48 },
      }),
    );
    const quote = (await provider.fetchQuotes(['41939'])).get('41939');
    assert.ok(quote);
    assert.equal(quote.timestampMs, 1781536000000); // raw, not shifted
    assert.equal(quote.series, undefined); // daily fallback is not a downsamplable series
  });
});
