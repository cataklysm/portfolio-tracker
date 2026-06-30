import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Logger } from '@portfolio/platform';
import { LstcClient } from './lstc-client.js';

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return noopLogger;
  },
} as unknown as Logger;

function makeClient(quoteType: 'mid' | 'max' = 'mid') {
  return new LstcClient({ baseUrl: 'https://ls.test', timeoutMs: 1000, quoteType }, noopLogger);
}

/** Stubs global fetch to return one JSON body; records requested URLs. */
function stubFetch(body: unknown, status = 200): { urls: URL[] } {
  const urls: URL[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    urls.push(input instanceof URL ? input : new URL(String(input)));
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { urls };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('LstcClient.search', () => {
  test('maps ISIN/WKN/name hits to instrument ids and sends q + localeId', async () => {
    const { urls } = stubFetch([
      {
        id: 41939,
        displayname: 'NETFLIX INC.      DL-,001',
        isin: 'US64110L1061',
        wkn: 552484,
        categoryName: 'Stock',
        instrumentId: 41939,
      },
    ]);
    const client = makeClient();
    const items = await client.search('US64110L1061', 10);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.instrumentId, 41939);
    assert.equal(items[0]!.name, 'NETFLIX INC.      DL-,001');
    assert.equal(items[0]!.isin, 'US64110L1061');
    assert.equal(items[0]!.wkn, '552484');
    assert.equal(items[0]!.category, 'Stock');
    assert.equal(urls[0]!.searchParams.get('q'), 'US64110L1061');
    assert.equal(urls[0]!.searchParams.get('localeId'), '1');
  });

  test('respects the limit', async () => {
    stubFetch([{ instrumentId: 1 }, { instrumentId: 2 }, { instrumentId: 3 }]);
    const client = makeClient();
    assert.equal((await client.search('x', 2)).length, 2);
  });

  test('non-array / error body yields []', async () => {
    stubFetch({ error: 'nope' });
    const client = makeClient();
    assert.deepEqual(await client.search('x', 5), []);
  });
});

describe('LstcClient.getHistory', () => {
  test('decodes [ms, price] pairs and the previous-day close', async () => {
    const { urls } = stubFetch({
      info: { plotlines: [{ id: 'previousDay', value: 70.48 }] },
      series: {
        history: {
          data: [
            [1022198400000, 18.2],
            [1022457600000, 18.64],
            [1781593680000, 67.88],
          ],
        },
      },
    });
    const client = makeClient('mid');
    const s = await client.getHistory(41939);
    assert.ok(s);
    assert.equal(s.points.length, 3);
    assert.deepEqual(s.points[0], { timeMs: 1022198400000, price: 18.2 });
    assert.equal(s.points.at(-1)!.price, 67.88);
    assert.equal(s.previousClose, 70.48);
    // request carries the right params
    const u = urls[0]!;
    assert.equal(u.searchParams.get('instrumentId'), '41939');
    assert.equal(u.searchParams.get('series'), 'history');
    assert.equal(u.searchParams.get('quotetype'), 'mid');
    assert.equal(u.searchParams.get('marketId'), '1');
  });

  test('drops malformed points and tolerates missing plotlines', async () => {
    stubFetch({
      series: { history: { data: [[1, 10], [null, 11], [3, null], [4, 12]] } },
    });
    const client = makeClient();
    const s = await client.getHistory(1);
    assert.ok(s);
    assert.deepEqual(
      s.points.map((p) => p.timeMs),
      [1, 4],
    );
    assert.equal(s.previousClose, null);
  });

  test('passes quotetype=max when configured', async () => {
    const { urls } = stubFetch({ series: { history: { data: [] } } });
    await makeClient('max').getHistory(7);
    assert.equal(urls[0]!.searchParams.get('quotetype'), 'max');
  });

  test('non-2xx yields null', async () => {
    stubFetch({}, 500);
    assert.equal(await makeClient().getHistory(1), null);
  });
});

describe('LstcClient.getIntraday', () => {
  test('reads the intraday series', async () => {
    const { urls } = stubFetch({
      info: { plotlines: [{ id: 'previousDay', value: 70.48 }] },
      series: { intraday: { data: [[1781593680000, 70.47], [1781593740000, 70.46]] } },
    });
    const s = await makeClient().getIntraday(41939);
    assert.ok(s);
    assert.equal(s.points.length, 2);
    // Client passes timestamps through untouched; the provider normalizes them.
    assert.deepEqual(
      s.points.map((p) => p.timeMs),
      [1781593680000, 1781593740000],
    );
    assert.equal(s.points.at(-1)!.price, 70.46);
    assert.equal(urls[0]!.searchParams.get('series'), 'intraday');
  });
});
