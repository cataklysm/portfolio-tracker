import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { LiveQuoteHub, type QuoteUpdate } from './live-quote-hub.js';
import { LiveQuoteFanout } from './live-quote-fanout.js';
import type { ActiveHolding, HoldingsRepository } from './ports.js';

/** Records every query and returns canned holdings. */
class FakeHoldings implements HoldingsRepository {
  calls: { listingIds: string[]; userIds: string[] }[] = [];
  constructor(private readonly rows: ActiveHolding[] = []) {}
  async findOpenHolders(listingIds: string[], userIds: string[]): Promise<ActiveHolding[]> {
    this.calls.push({ listingIds, userIds });
    // Mimic the SQL scoping: only rows matching both filters come back.
    return this.rows.filter((r) => listingIds.includes(r.listingId) && userIds.includes(r.userId));
  }
}

describe('LiveQuoteFanout', () => {
  let hub: LiveQuoteHub;
  let received: Map<string, QuoteUpdate[]>;

  function connect(userId: string): void {
    const list = received.get(userId) ?? [];
    received.set(userId, list);
    hub.subscribe(userId, (u) => list.push(u));
  }

  beforeEach(() => {
    hub = new LiveQuoteHub();
    received = new Map();
  });

  test('pushes each connected holder only the listings they hold', async () => {
    connect('user-a');
    connect('user-b');
    const holdings = new FakeHoldings([
      { userId: 'user-a', listingId: 'L1' },
      { userId: 'user-a', listingId: 'L2' },
      { userId: 'user-b', listingId: 'L2' },
    ]);
    const fanout = new LiveQuoteFanout({ hub, holdings });

    await fanout.fanOut(['L1', 'L2', 'L3'], '2026-06-29T10:00:00Z');

    assert.deepEqual(received.get('user-a'), [{ listingIds: ['L1', 'L2'], asOf: '2026-06-29T10:00:00Z' }]);
    assert.deepEqual(received.get('user-b'), [{ listingIds: ['L2'], asOf: '2026-06-29T10:00:00Z' }]);
  });

  test('scopes the holder query to connected users and the unique listings', async () => {
    connect('user-a');
    const holdings = new FakeHoldings([{ userId: 'user-a', listingId: 'L1' }]);
    const fanout = new LiveQuoteFanout({ hub, holdings });

    await fanout.fanOut(['L1', 'L1', '', 'L2'], null);

    assert.equal(holdings.calls.length, 1);
    assert.deepEqual(holdings.calls[0], { listingIds: ['L1', 'L2'], userIds: ['user-a'] });
  });

  test('does not query when no client is connected', async () => {
    const holdings = new FakeHoldings([{ userId: 'user-a', listingId: 'L1' }]);
    const fanout = new LiveQuoteFanout({ hub, holdings });

    await fanout.fanOut(['L1'], null);

    assert.equal(holdings.calls.length, 0);
  });

  test('does not query when the batch has no usable listing ids', async () => {
    connect('user-a');
    const holdings = new FakeHoldings([{ userId: 'user-a', listingId: 'L1' }]);
    const fanout = new LiveQuoteFanout({ hub, holdings });

    await fanout.fanOut(['', '  '.trim()], null);

    assert.equal(holdings.calls.length, 0);
    assert.deepEqual(received.get('user-a'), []);
  });

  test('a connected user holding none of the updated listings gets nothing', async () => {
    connect('user-a');
    const holdings = new FakeHoldings([{ userId: 'user-a', listingId: 'L9' }]);
    const fanout = new LiveQuoteFanout({ hub, holdings });

    await fanout.fanOut(['L1'], null);

    assert.deepEqual(received.get('user-a'), []);
  });
});
