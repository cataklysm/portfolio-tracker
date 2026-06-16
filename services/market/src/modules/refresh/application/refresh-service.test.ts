import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '@portfolio/platform';
import { RefreshService } from './refresh-service.js';
import type { PlanListing } from '../../quotes/index.js';

const logger = createLogger({ service: 'test', serviceVersion: '0', environment: 'test', pretty: false });

function entry(
  listingId: string,
  provider: string | null,
  symbol: string | null,
  marketStatus?: PlanListing['marketStatus'],
): PlanListing {
  return { listingId, instrumentId: `i-${listingId}`, symbol: 'X', currency: 'EUR', provider, providerSymbol: symbol, marketStatus };
}

interface BatchedCall {
  provider: string;
  count: number;
  batchSize: number;
}

function buildService(plan: PlanListing[], settings: { provider: string; maxBatchSize: number | null }[]) {
  const batched: BatchedCall[] = [];
  const recorded: { provider: string; listingIds: string[] }[] = [];
  const analystChunks: string[][] = [];

  const service = new RefreshService({
    planResolver: { resolve: () => Promise.resolve(plan) },
    providers: { fetchProviderSettings: () => Promise.resolve(settings.map((s) => ({
      provider: s.provider,
      enabled: true,
      providerClass: 'symbol' as const,
      dataQuality: 'medium' as const,
      maxBatchSize: s.maxBatchSize,
      rateLimitPerMin: null,
      maxConcurrency: 4,
    })) ) },
    refreshState: {
      recordRefresh: (listingIds, provider) => {
        recorded.push({ provider, listingIds });
        return Promise.resolve();
      },
    },
    quotes: {
      refreshLatestBatched: (provider, entries, batchSize) => {
        batched.push({ provider, count: entries.length, batchSize });
        return Promise.resolve(entries.length);
      },
    },
    fx: { refreshDaily: () => Promise.resolve(0) },
    analyst: {
      refreshForListings: (ids) => {
        analystChunks.push(ids);
        return Promise.resolve(ids.length);
      },
    },
    logger,
    intervalMs: 60_000,
  });

  return { service, batched, recorded, analystChunks };
}

describe('RefreshService.runCycle', () => {
  test('groups listings by selected provider and paces each with its batch size', async () => {
    const plan = [
      entry('l1', 'yahoo', 'AAPL'),
      entry('l2', 'yahoo', 'MSFT'),
      entry('l3', 'eodhd', 'SAP.DE'),
    ];
    const { service, batched } = buildService(plan, [
      { provider: 'yahoo', maxBatchSize: 50 },
      { provider: 'eodhd', maxBatchSize: null }, // single-symbol → batch size 1
    ]);

    await service.runCycle();

    const yahoo = batched.find((b) => b.provider === 'yahoo');
    const eodhd = batched.find((b) => b.provider === 'eodhd');
    assert.equal(yahoo?.count, 2);
    assert.equal(yahoo?.batchSize, 50);
    assert.equal(eodhd?.count, 1);
    assert.equal(eodhd?.batchSize, 1); // null max_batch_size ⇒ single-symbol throttle
  });

  test('skips listings with no selected provider or no provider symbol', async () => {
    const plan = [
      entry('l1', 'yahoo', 'AAPL'),
      entry('l2', null, 'NOSEL'), // no provider selected
      entry('l3', 'yahoo', null), // no provider symbol mapped
    ];
    const { service, batched } = buildService(plan, [{ provider: 'yahoo', maxBatchSize: 50 }]);

    await service.runCycle();

    // Only l1 is fetchable; l3 is dropped (null symbol), l2 has no provider group.
    const yahoo = batched.find((b) => b.provider === 'yahoo');
    assert.equal(yahoo?.count, 1);
  });

  test('skips listings on closed exchanges; refreshes open and unknown', async () => {
    const plan = [
      entry('l1', 'yahoo', 'AAPL', 'open'),
      entry('l2', 'yahoo', 'MSFT', 'closed'),
      entry('l3', 'yahoo', 'SAP.DE', 'weekend'),
      entry('l4', 'yahoo', 'HOL', 'holiday'),
      entry('l5', 'yahoo', 'BTC', 'unknown'), // crypto / exchange-less → always refresh
      entry('l6', 'yahoo', 'NOSTATUS'), // status absent → refresh (backward-compatible)
    ];
    const { service, batched } = buildService(plan, [{ provider: 'yahoo', maxBatchSize: 50 }]);

    await service.runCycle();

    // Only l1 (open), l5 (unknown), l6 (absent) are fetched; l2/l3/l4 are skipped.
    const yahoo = batched.find((b) => b.provider === 'yahoo');
    assert.equal(yahoo?.count, 3);
  });

  test('records the refresh tagged with the actual provider', async () => {
    const plan = [entry('l1', 'eodhd', 'SAP.DE')];
    const { service, recorded } = buildService(plan, [{ provider: 'eodhd', maxBatchSize: 10 }]);

    await service.runCycle();

    assert.equal(recorded.length, 1);
    const rec = recorded[0];
    assert.ok(rec);
    assert.equal(rec.provider, 'eodhd');
    assert.deepEqual(rec.listingIds, ['l1']);
  });

  test('refreshes analyst over every listing in the plan', async () => {
    const plan = [entry('l1', 'yahoo', 'A'), entry('l2', null, null)];
    const { service, analystChunks } = buildService(plan, [{ provider: 'yahoo', maxBatchSize: 50 }]);

    await service.runCycle();

    assert.deepEqual(analystChunks.flat().sort(), ['l1', 'l2']);
  });
});
