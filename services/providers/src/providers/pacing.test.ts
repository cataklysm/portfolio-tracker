import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPacing } from './pacing.js';
import type { ProviderSettingsRepository } from './settings-repository.js';
import type { ProviderSettings } from './types.js';
import type { Logger } from '@portfolio/platform';

function settings(over: Partial<ProviderSettings> & Pick<ProviderSettings, 'provider'>): ProviderSettings {
  return {
    enabled: true,
    providerClass: 'symbol',
    dataQuality: 'unknown',
    capabilityQuality: {},
    maxBatchSize: null,
    rateLimitPerMin: null,
    maxConcurrency: 4,
    maxPerCycle: null,
    ...over,
  };
}

function fakePacing(rows: ProviderSettings[]): ProviderPacing {
  const repo = { listAll: async () => rows } as unknown as ProviderSettingsRepository;
  const logger = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;
  return new ProviderPacing(repo, logger);
}

/** A promise plus its resolver, to control when a task completes. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('ProviderPacing concurrency', () => {
  test('never runs more than maxConcurrency outbound calls at once', async () => {
    const pacing = fakePacing([settings({ provider: 'p', maxConcurrency: 2 })]);
    const gates = [deferred(), deferred(), deferred(), deferred(), deferred()];
    let active = 0;
    let peak = 0;

    const runs = gates.map((g) =>
      pacing.run('p', async () => {
        active += 1;
        peak = Math.max(peak, active);
        await g.promise;
        active -= 1;
      }),
    );

    // Let the scheduler admit the first batch.
    await delay(10);
    assert.equal(peak, 2, 'only two should be admitted initially');

    // Release one → exactly one more is admitted.
    gates[0]!.resolve();
    await delay(10);
    assert.equal(peak, 2, 'peak stays at the limit as slots free up');

    for (const g of gates) g.resolve();
    await Promise.all(runs);
    assert.equal(active, 0);
  });

  test('unlimited concurrency runs all at once when maxConcurrency is high', async () => {
    const pacing = fakePacing([settings({ provider: 'p', maxConcurrency: 100 })]);
    const gates = [deferred(), deferred(), deferred()];
    let active = 0;
    let peak = 0;
    const runs = gates.map((g) =>
      pacing.run('p', async () => { active += 1; peak = Math.max(peak, active); await g.promise; active -= 1; }),
    );
    await delay(10);
    assert.equal(peak, 3);
    for (const g of gates) g.resolve();
    await Promise.all(runs);
  });
});

describe('ProviderPacing rate limit', () => {
  test('a rate-limited provider still completes calls (token bucket)', async () => {
    const pacing = fakePacing([settings({ provider: 'p', rateLimitPerMin: 600, maxConcurrency: 4 })]);
    const results = await Promise.all([1, 2, 3].map((n) => pacing.run('p', async () => n)));
    assert.deepEqual(results.sort(), [1, 2, 3]);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
