import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '@portfolio/platform';
import { SelectionService } from './selection-service.js';
import type {
  ActiveListing,
  ProviderSelectionView,
  ProviderUsageView,
  RefreshPlanEntry,
  SelectableCapability,
  SelectionRepository,
} from './ports.js';

const INSTRUMENT = 'inst-1';

/** In-memory selection repository for the service's business-rule tests. */
class FakeRepo implements SelectionRepository {
  rows = new Map<string, string>(); // capability -> provider
  exists = true;

  instrumentExists(): Promise<boolean> {
    return Promise.resolve(this.exists);
  }

  listForInstrument(): Promise<ProviderSelectionView[]> {
    return Promise.resolve(
      [...this.rows.entries()]
        .map(([capability, provider]) => ({ capability: capability as SelectableCapability, provider }))
        .sort((a, b) => a.capability.localeCompare(b.capability)),
    );
  }

  upsert(_instrumentId: string, rows: { capability: SelectableCapability; provider: string }[]): Promise<void> {
    for (const row of rows) this.rows.set(row.capability, row.provider);
    return Promise.resolve();
  }

  refreshPlan(): Promise<RefreshPlanEntry[]> {
    return Promise.resolve([]);
  }

  listActiveListings(): Promise<ActiveListing[]> {
    return Promise.resolve([]);
  }

  usageForProvider(): Promise<ProviderUsageView[]> {
    return Promise.resolve([]);
  }
}

describe('SelectionService', () => {
  test('setting quotes also sets chart to the same provider (one price series)', async () => {
    const repo = new FakeRepo();
    const service = new SelectionService(repo);

    const result = await service.setInstrumentSelection(INSTRUMENT, 'quotes', 'eodhd');

    assert.equal(repo.rows.get('quotes'), 'eodhd');
    assert.equal(repo.rows.get('chart'), 'eodhd');
    assert.deepEqual(
      result.filter((r) => r.capability === 'quotes' || r.capability === 'chart').map((r) => r.provider),
      ['eodhd', 'eodhd'],
    );
  });

  test('setting chart also pins quotes', async () => {
    const repo = new FakeRepo();
    const service = new SelectionService(repo);
    await service.setInstrumentSelection(INSTRUMENT, 'chart', 'eodhd');
    assert.equal(repo.rows.get('quotes'), 'eodhd');
    assert.equal(repo.rows.get('chart'), 'eodhd');
  });

  test('a standalone capability is set on its own', async () => {
    const repo = new FakeRepo();
    const service = new SelectionService(repo);
    await service.setInstrumentSelection(INSTRUMENT, 'fundamentals', 'eodhd');
    assert.equal(repo.rows.get('fundamentals'), 'eodhd');
    assert.equal(repo.rows.has('quotes'), false);
  });

  test('setting any events feed assigns the whole events group together', async () => {
    const repo = new FakeRepo();
    const service = new SelectionService(repo);
    await service.setInstrumentSelection(INSTRUMENT, 'news', 'eodhd');
    assert.equal(repo.rows.get('earnings'), 'eodhd');
    assert.equal(repo.rows.get('corporate_actions'), 'eodhd');
    assert.equal(repo.rows.get('news'), 'eodhd');
    assert.equal(repo.rows.has('quotes'), false);
  });

  test('rejects an unknown / non-selectable capability (fx, symbol_search)', async () => {
    const service = new SelectionService(new FakeRepo());
    await assert.rejects(() => service.setInstrumentSelection(INSTRUMENT, 'fx', 'ecb'), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.status, 400);
      return true;
    });
    await assert.rejects(() => service.setInstrumentSelection(INSTRUMENT, 'symbol_search', 'yahoo'), AppError);
  });

  test('rejects a blank provider', async () => {
    const service = new SelectionService(new FakeRepo());
    await assert.rejects(() => service.setInstrumentSelection(INSTRUMENT, 'quotes', '   '), AppError);
  });

  test('unknown instrument is a 404 on read and write', async () => {
    const repo = new FakeRepo();
    repo.exists = false;
    const service = new SelectionService(repo);
    await assert.rejects(() => service.getInstrumentSelections(INSTRUMENT), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.status, 404);
      return true;
    });
    await assert.rejects(() => service.setInstrumentSelection(INSTRUMENT, 'quotes', 'yahoo'), AppError);
  });
});
