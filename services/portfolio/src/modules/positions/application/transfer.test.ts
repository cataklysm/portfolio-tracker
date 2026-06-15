import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PositionService, type PositionServiceDeps } from './position-service.js';
import type { AccountingMethod } from '../domain/realization.js';
import type {
  LotTransferInput,
  LotTransferResult,
  PositionRecord,
  PositionRepository,
  PositionWriteState,
  SettingsReader,
  StoredTransaction,
  TransferInput,
  TransferResult,
} from './ports.js';

/** A minimal stored buy/sell for the realization replay (only the read fields matter). */
function tx(id: string, side: 'buy' | 'sell', quantity: string, price: string): StoredTransaction {
  return {
    id,
    side,
    quantity,
    price,
    fee: '0',
    currency: 'EUR',
    effective_at: '2026-01-01T12:00:00.000Z',
    tax_relevant_value_date: '2026-01-01',
    savings_plan: false,
    note: null,
  } as unknown as StoredTransaction;
}

/** A repository fake covering only what transferPosition/transferLots + recalculate touch. */
class FakeRepo implements Partial<PositionRepository> {
  position: PositionRecord | null = {
    id: 'pos-1',
    portfolio_id: 'pf-source',
    listing_id: 'listing-x',
    state: 'open',
  };
  ownedPortfolios = new Set<string>(['pf-source', 'pf-dest']);
  transferResult: TransferResult = { transferId: 'tr-1', resultingPositionId: 'pos-1', merged: false };
  transferArgs: TransferInput | undefined;
  transactions: StoredTransaction[] = [];
  lotTransferResult: LotTransferResult = {
    transferId: 'tr-9',
    destinationPositionId: 'pos-dest',
    createdDestination: true,
  };
  lotTransferArgs: LotTransferInput | undefined;
  recalculated: string[] = [];

  async getOwnedPosition(positionId: string): Promise<PositionRecord | null> {
    return this.position && this.position.id === positionId ? this.position : null;
  }
  async assertPortfolioOwned(portfolioId: string): Promise<boolean> {
    return this.ownedPortfolios.has(portfolioId);
  }
  async transferPosition(input: TransferInput): Promise<TransferResult> {
    this.transferArgs = input;
    return this.transferResult;
  }
  async transferLots(input: LotTransferInput): Promise<LotTransferResult> {
    this.lotTransferArgs = input;
    return this.lotTransferResult;
  }
  async listTransactions(): Promise<StoredTransaction[]> {
    return this.transactions;
  }
  async applyPositionState(positionId: string, _write: PositionWriteState): Promise<void> {
    this.recalculated.push(positionId);
  }
}

function makeService(repo: FakeRepo, method: AccountingMethod = 'fifo'): PositionService {
  const settings: SettingsReader = {
    getUserSettings: async () => ({ reportingCurrency: 'EUR', accountingMethod: method }),
  };
  return new PositionService({ repo, settings } as unknown as PositionServiceDeps);
}

describe('PositionService.transferPosition', () => {
  let repo: FakeRepo;
  beforeEach(() => {
    repo = new FakeRepo();
  });

  test('rejects transferring to the portfolio the position is already in', async () => {
    await assert.rejects(
      () => makeService(repo).transferPosition('u1', 'tok', 'pos-1', { destinationPortfolioId: 'pf-source' }),
      /already in that portfolio/,
    );
    assert.equal(repo.transferArgs, undefined);
  });

  test('rejects a destination portfolio the user does not own', async () => {
    await assert.rejects(
      () => makeService(repo).transferPosition('u1', 'tok', 'pos-1', { destinationPortfolioId: 'pf-other' }),
      /not found/i,
    );
    assert.equal(repo.transferArgs, undefined);
  });

  test('reassigns the position and recomputes its state', async () => {
    const result = await makeService(repo).transferPosition('u1', 'tok', 'pos-1', {
      destinationPortfolioId: 'pf-dest',
    });

    assert.deepEqual(repo.transferArgs, {
      positionId: 'pos-1',
      listingId: 'listing-x',
      sourcePortfolioId: 'pf-source',
      destinationPortfolioId: 'pf-dest',
      effectiveAt: repo.transferArgs!.effectiveAt, // defaulted to now
    });
    assert.ok(repo.transferArgs!.effectiveAt instanceof Date);
    assert.deepEqual(result, { transfer_id: 'tr-1', position_id: 'pos-1', merged: false });
    assert.deepEqual(repo.recalculated, ['pos-1']);
  });

  test('on a merge, recomputes the surviving destination position', async () => {
    repo.transferResult = { transferId: 'tr-2', resultingPositionId: 'pos-dest', merged: true };

    const result = await makeService(repo).transferPosition('u1', 'tok', 'pos-1', {
      destinationPortfolioId: 'pf-dest',
    });

    assert.deepEqual(result, { transfer_id: 'tr-2', position_id: 'pos-dest', merged: true });
    assert.deepEqual(repo.recalculated, ['pos-dest']);
  });
});

describe('PositionService.transferLots', () => {
  let repo: FakeRepo;
  beforeEach(() => {
    repo = new FakeRepo();
    repo.transactions = [tx('b1', 'buy', '10', '100'), tx('b2', 'buy', '5', '120')];
  });

  test('rejects the same portfolio and unowned destinations', async () => {
    await assert.rejects(
      () => makeService(repo).transferLots('u1', 'tok', 'pos-1', { destinationPortfolioId: 'pf-source', lotTransactionIds: ['b1'] }),
      /already in that portfolio/,
    );
    await assert.rejects(
      () => makeService(repo).transferLots('u1', 'tok', 'pos-1', { destinationPortfolioId: 'pf-other', lotTransactionIds: ['b1'] }),
      /not found/i,
    );
    assert.equal(repo.lotTransferArgs, undefined);
  });

  test('rejects ids that are not buys in the position', async () => {
    await assert.rejects(
      () => makeService(repo).transferLots('u1', 'tok', 'pos-1', { destinationPortfolioId: 'pf-dest', lotTransactionIds: ['nope'] }),
      /not in this position/,
    );
    repo.transactions = [tx('b1', 'buy', '10', '100'), tx('s1', 'sell', '4', '130')];
    await assert.rejects(
      () => makeService(repo).transferLots('u1', 'tok', 'pos-1', { destinationPortfolioId: 'pf-dest', lotTransactionIds: ['s1'] }),
      /Only buy lots/,
    );
  });

  test('rejects a lot a sell has already consumed (FIFO)', async () => {
    repo.transactions = [tx('b1', 'buy', '10', '100'), tx('s1', 'sell', '4', '130')];
    await assert.rejects(
      () => makeService(repo).transferLots('u1', 'tok', 'pos-1', { destinationPortfolioId: 'pf-dest', lotTransactionIds: ['b1'] }),
      /untouched by a sale/,
    );
  });

  test('rejects average-cost positions that have sales', async () => {
    repo.transactions = [tx('b1', 'buy', '10', '100'), tx('s1', 'sell', '4', '130')];
    await assert.rejects(
      () => makeService(repo, 'average_cost').transferLots('u1', 'tok', 'pos-1', { destinationPortfolioId: 'pf-dest', lotTransactionIds: ['b1'] }),
      /average-cost/,
    );
  });

  test('moves fully-open lots, sums their quantity, and recomputes both positions', async () => {
    const result = await makeService(repo).transferLots('u1', 'tok', 'pos-1', {
      destinationPortfolioId: 'pf-dest',
      lotTransactionIds: ['b1', 'b2', 'b1'], // duplicate is de-duped
    });

    assert.equal(repo.lotTransferArgs?.sourcePositionId, 'pos-1');
    assert.equal(repo.lotTransferArgs?.listingId, 'listing-x');
    assert.deepEqual(repo.lotTransferArgs?.lotTransactionIds, ['b1', 'b2']);
    assert.equal(repo.lotTransferArgs?.transferredQuantity, '15'); // 10 + 5
    assert.deepEqual(result, {
      transfer_id: 'tr-9',
      source_position_id: 'pos-1',
      destination_position_id: 'pos-dest',
      created: true,
    });
    assert.deepEqual(repo.recalculated, ['pos-1', 'pos-dest']);
  });
});
