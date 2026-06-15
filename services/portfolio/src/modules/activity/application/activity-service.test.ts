import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ActivityService, encodeCursor, decodeCursor } from './activity-service.js';
import type { ActivityQuery, ActivityRepository, ActivityRow } from './ports.js';

function row(id: string, occurredAt: string, kind: ActivityRow['kind'] = 'trade'): ActivityRow {
  return {
    id,
    kind,
    occurred_at: new Date(occurredAt),
    portfolio_id: 'pf',
    position_id: null,
    subtype: kind === 'trade' ? 'buy' : 'dividend',
    currency: 'EUR',
    amount: '100.00',
    quantity: kind === 'trade' ? '1' : null,
    price: kind === 'trade' ? '100' : null,
    fee: '0',
    direction: null,
    note: null,
  };
}

/** Captures the query and returns a fixed set of rows (already ordered). */
class FakeRepo implements ActivityRepository {
  lastQuery: ActivityQuery | undefined;
  constructor(private readonly rows: ActivityRow[]) {}
  async list(query: ActivityQuery): Promise<ActivityRow[]> {
    this.lastQuery = query;
    return this.rows.slice(0, query.limit);
  }
}

describe('cursor codec', () => {
  test('round-trips occurred_at + id', () => {
    const cursor = encodeCursor({ occurred_at: new Date('2026-06-10T12:00:00.000Z'), id: 'abc-1' });
    assert.deepEqual(decodeCursor(cursor), { occurredAt: '2026-06-10T12:00:00.000Z', id: 'abc-1' });
  });

  test('rejects malformed cursors', () => {
    assert.equal(decodeCursor('not-base64-!!'), undefined);
    assert.equal(decodeCursor(Buffer.from('nopipe', 'utf8').toString('base64url')), undefined);
    assert.equal(decodeCursor(Buffer.from('notadate|id', 'utf8').toString('base64url')), undefined);
  });
});

describe('ActivityService.list', () => {
  test('requests one extra row and trims, emitting a next_cursor when more exist', async () => {
    // limit 2 → service asks for 3; repo has 3 → hasMore.
    const rows = [
      row('c', '2026-06-12T00:00:00.000Z'),
      row('b', '2026-06-11T00:00:00.000Z'),
      row('a', '2026-06-10T00:00:00.000Z'),
    ];
    const repo = new FakeRepo(rows);
    const service = new ActivityService(repo);

    const page = await service.list('u1', { limit: 2 });

    assert.equal(repo.lastQuery?.limit, 3);
    assert.equal(page.items.length, 2);
    assert.deepEqual(
      page.items.map((i) => i.id),
      ['c', 'b'],
    );
    assert.ok(page.next_cursor, 'expected a next_cursor');
    // The cursor points at the last returned row (b), not the probe row (a).
    assert.deepEqual(decodeCursor(page.next_cursor!), { occurredAt: '2026-06-11T00:00:00.000Z', id: 'b' });
  });

  test('no next_cursor when the page is not full', async () => {
    const repo = new FakeRepo([row('b', '2026-06-11T00:00:00.000Z')]);
    const page = await new ActivityService(repo).list('u1', { limit: 50 });
    assert.equal(page.items.length, 1);
    assert.equal(page.next_cursor, null);
  });

  test('serializes occurred_at to ISO and passes filters + decoded cursor through', async () => {
    const repo = new FakeRepo([row('b', '2026-06-11T00:00:00.000Z', 'cash_flow')]);
    const cursor = encodeCursor({ occurred_at: new Date('2026-06-12T00:00:00.000Z'), id: 'c' });

    const page = await new ActivityService(repo).list('u1', {
      portfolioId: 'pf-9',
      kind: 'cash_flow',
      cursor,
      limit: 10,
    });

    assert.equal(page.items[0]?.occurred_at, '2026-06-11T00:00:00.000Z');
    assert.equal(repo.lastQuery?.portfolioId, 'pf-9');
    assert.equal(repo.lastQuery?.kind, 'cash_flow');
    assert.deepEqual(repo.lastQuery?.before, { occurredAt: '2026-06-12T00:00:00.000Z', id: 'c' });
  });

  test('clamps the limit to the allowed range', async () => {
    const repo = new FakeRepo([]);
    const service = new ActivityService(repo);
    await service.list('u1', { limit: 9999 });
    assert.equal(repo.lastQuery?.limit, 101); // 100 max + 1 probe
    await service.list('u1', { limit: 0 });
    assert.equal(repo.lastQuery?.limit, 2); // 1 min + 1 probe
  });
});
