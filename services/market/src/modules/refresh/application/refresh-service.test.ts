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
  minutesSinceClose?: number | null,
): PlanListing {
  return {
    listingId,
    instrumentId: `i-${listingId}`,
    symbol: 'X',
    currency: 'EUR',
    provider,
    providerSymbol: symbol,
    marketStatus,
    minutesSinceClose,
  };
}

interface BatchedCall {
  provider: string;
  count: number;
  batchSize: number;
}

function buildService(
  plan: PlanListing[],
  settings: { provider: string; maxBatchSize: number | null }[],
  cadence: { provider: string; capability: string; refreshIntervalMs: number; saveResolutionMs?: number | null; enabled?: boolean }[] = [],
) {
  const batched: BatchedCall[] = [];
  const recorded: { provider: string; listingIds: string[] }[] = [];
  const analystChunks: string[][] = [];

  const service = new RefreshService({
    planResolver: { resolve: () => Promise.resolve(plan) },
    providers: {
      fetchProviderSettings: () => Promise.resolve(settings.map((s) => ({
        provider: s.provider,
        enabled: true,
        providerClass: 'symbol' as const,
        dataQuality: 'medium' as const,
        maxBatchSize: s.maxBatchSize,
        rateLimitPerMin: null,
        maxConcurrency: 4,
        maxPerCycle: null,
      }))),
      fetchCapabilityRefresh: () => Promise.resolve(cadence.map((c) => ({
        provider: c.provider,
        capability: c.capability,
        refreshIntervalMs: c.refreshIntervalMs,
        saveResolutionMs: c.saveResolutionMs ?? null,
        enabled: c.enabled ?? true,
      }))),
    },
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
    defaultIntervalMs: 60_000,
    closeCaptureGraceMs: 30 * 60 * 1000,
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

  test('skips a provider whose quotes cadence is disabled', async () => {
    const plan = [entry('l1', 'yahoo', 'AAPL'), entry('l2', 'lstc', '41939')];
    const { service, batched } = buildService(
      plan,
      [{ provider: 'yahoo', maxBatchSize: 50 }, { provider: 'lstc', maxBatchSize: null }],
      [
        { provider: 'yahoo', capability: 'quotes', refreshIntervalMs: 300_000 },
        { provider: 'lstc', capability: 'quotes', refreshIntervalMs: 300_000, enabled: false },
      ],
    );

    await service.runCycle();

    assert.ok(batched.find((b) => b.provider === 'yahoo'));
    assert.equal(batched.find((b) => b.provider === 'lstc'), undefined);
  });

  test('catches the close once for a just-closed listing, then not again', async () => {
    // Closed 2 minutes ago on a trading day → eligible for one post-close fetch.
    const plan = [entry('l1', 'lstc', '41939', 'closed', 2)]
    const { service, batched } = buildService(plan, [{ provider: 'lstc', maxBatchSize: null }])

    await service.runCycle() // first tick: captures the close
    await service.runCycle() // second tick: same close already captured → skipped

    const lstcCalls = batched.filter((b) => b.provider === 'lstc')
    assert.equal(lstcCalls.length, 1)
    assert.equal(lstcCalls[0]?.count, 1)
  })

  test('does not catch the close once the grace window has passed', async () => {
    // Closed 45 minutes ago — beyond the 30-minute grace window.
    const plan = [entry('l1', 'lstc', '41939', 'closed', 45)]
    const { service, batched } = buildService(plan, [{ provider: 'lstc', maxBatchSize: null }])

    await service.runCycle()

    assert.equal(batched.find((b) => b.provider === 'lstc'), undefined)
  })

  test('analyst respects its per-provider interval across heartbeats', async () => {
    const plan = [entry('l1', 'yahoo', 'A')];
    const { service, analystChunks } = buildService(
      plan,
      [{ provider: 'yahoo', maxBatchSize: 50 }],
      [{ provider: 'yahoo', capability: 'analyst', refreshIntervalMs: 3_600_000 }],
    );

    await service.runCycle(); // first tick: due → runs
    await service.runCycle(); // immediate second tick: still within interval → skipped

    assert.equal(analystChunks.length, 1);
  });
});
