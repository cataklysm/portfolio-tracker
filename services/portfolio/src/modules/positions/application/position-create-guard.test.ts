import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PositionService, type PositionServiceDeps } from './position-service.js';
import type { ListingSummary } from './ports.js';

/** Minimal deps covering createPosition up to the holdability guard. */
function makeService(assetType: ListingSummary['asset_type']): PositionService {
  const listing: ListingSummary = {
    listing_id: 'listing-x',
    instrument_id: 'instr-x',
    symbol: 'X',
    name: 'X',
    asset_type: assetType,
    currency: 'EUR',
  };
  const deps = {
    repo: {
      assertPortfolioOwned: async () => true,
      // Reached only for holdable types; throws so the test fails loudly if the
      // guard does not short-circuit an index listing first.
      upsertPosition: async () => {
        throw new Error('should not reach upsert for a non-holdable listing');
      },
    },
    listings: { getListings: async () => new Map([['listing-x', listing]]) },
    settings: { getUserSettings: async () => ({ reportingCurrency: 'EUR', accountingMethod: 'fifo' }) },
  } as unknown as PositionServiceDeps;
  return new PositionService(deps);
}

const buyInput = {
  portfolioId: 'pf-1',
  listingId: 'listing-x',
  transaction: {
    side: 'buy' as const,
    quantity: '1',
    price: '100',
    fee: '0',
    currency: 'EUR',
    effectiveAt: new Date('2026-01-10T12:00:00.000Z'),
    taxRelevantValueDate: '2026-01-10',
    savingsPlan: false,
    bookingFxRate: null,
    note: null,
  },
};

describe('PositionService.createPosition — index listings are non-holdable', () => {
  test('rejects opening a position on an index listing', async () => {
    await assert.rejects(
      () => makeService('index').createPosition('u1', 'tok', buyInput),
      /cannot be held|index_not_holdable/i,
    );
  });
});
