import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PositionService, type PositionServiceDeps } from './position-service.js';
import type {
  PositionRecord,
  PositionRepository,
  PositionWriteState,
  SettingsReader,
  TransferInput,
  TransferResult,
} from './ports.js';

/** A repository fake covering only what transferPosition + recalculate touch. */
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
  async listTransactions(): Promise<[]> {
    return [];
  }
  async applyPositionState(positionId: string, _write: PositionWriteState): Promise<void> {
    this.recalculated.push(positionId);
  }
}

const settings: SettingsReader = {
  getUserSettings: async () => ({ reportingCurrency: 'EUR', accountingMethod: 'fifo' }),
};

function makeService(repo: FakeRepo): PositionService {
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
