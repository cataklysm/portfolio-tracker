import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CorporateActionService } from './corporate-action-service.js';
import type {
  CorporateActionApplicationRepository,
  NewCorporateActionApplication,
  OwnedApplication,
} from './ports.js';
import type { PositionService } from '../../positions/application/position-service.js';

class FakeRepo implements CorporateActionApplicationRepository {
  inserted: NewCorporateActionApplication | undefined;
  owned: OwnedApplication | null = { id: 'app-1', position_id: 'pos-1', reversed_at: null };
  reversedId: string | undefined;
  async insert(input: NewCorporateActionApplication): Promise<{ id: string }> {
    this.inserted = input;
    return { id: 'app-1' };
  }
  async listForPosition(): Promise<[]> {
    return [];
  }
  async getOwnedApplication(): Promise<OwnedApplication | null> {
    return this.owned;
  }
  async markReversed(applicationId: string): Promise<void> {
    this.reversedId = applicationId;
  }
}

function makeService(repo: FakeRepo, opts: { owned?: boolean } = {}) {
  const recalced: string[] = [];
  const positions = {
    async getOwnedPositionRecord(_userId: string, positionId: string) {
      if (opts.owned === false) {
        const { AppError } = await import('@portfolio/platform');
        throw AppError.notFound('position_not_found', 'Position not found');
      }
      return { id: positionId, portfolio_id: 'pf', listing_id: 'listing', state: 'open' as const };
    },
    async recalculatePosition(positionId: string) {
      recalced.push(positionId);
    },
  } as unknown as PositionService;
  return { service: new CorporateActionService({ repo, positions }), recalced };
}

const SPLIT = { corporateActionId: 'evt:AAPL:split:2024-06-01', type: 'split', ratioNumerator: '2', ratioDenominator: '1', exDate: '2024-06-01' };

describe('CorporateActionService.apply', () => {
  let repo: FakeRepo;
  beforeEach(() => {
    repo = new FakeRepo();
  });

  test('applies a split: derives a UUID, snapshots + hashes, then recalculates', async () => {
    const { service, recalced } = makeService(repo);
    const result = await service.apply('u1', 'tok', 'pos-1', SPLIT);

    assert.equal(result.application_id, 'app-1');
    assert.ok(repo.inserted);
    // corporate_action_id is a derived UUID, not the raw stable id.
    assert.match(repo.inserted!.corporateActionId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.notEqual(repo.inserted!.corporateActionId, SPLIT.corporateActionId);
    assert.equal(repo.inserted!.tokenSignatureHash.length, 64); // sha-256 hex
    assert.equal(repo.inserted!.ratioNumerator, '2');
    assert.deepEqual(recalced, ['pos-1']);
  });

  test('rejects a non-ratio action type', async () => {
    const { service } = makeService(repo);
    await assert.rejects(() => service.apply('u1', 'tok', 'pos-1', { ...SPLIT, type: 'dividend' }), /split \/ reverse_split/);
    assert.equal(repo.inserted, undefined);
  });

  test('rejects a non-positive ratio', async () => {
    const { service } = makeService(repo);
    await assert.rejects(() => service.apply('u1', 'tok', 'pos-1', { ...SPLIT, ratioNumerator: '0' }), /positive ratio/);
  });

  test('rejects when the position is not owned', async () => {
    const { service } = makeService(repo, { owned: false });
    await assert.rejects(() => service.apply('u1', 'tok', 'pos-1', SPLIT), /not found/i);
    assert.equal(repo.inserted, undefined);
  });
});

describe('CorporateActionService.reverse', () => {
  let repo: FakeRepo;
  beforeEach(() => {
    repo = new FakeRepo();
  });

  test('reverses an active application and recalculates its position', async () => {
    const { service, recalced } = makeService(repo);
    const result = await service.reverse('u1', 'tok', 'app-1', 'data fix');
    assert.deepEqual(result, { position_id: 'pos-1' });
    assert.equal(repo.reversedId, 'app-1');
    assert.deepEqual(recalced, ['pos-1']);
  });

  test('404 when the application is not owned', async () => {
    repo.owned = null;
    const { service } = makeService(repo);
    await assert.rejects(() => service.reverse('u1', 'tok', 'app-x', null), /not found/i);
  });

  test('rejects reversing an already-reversed application', async () => {
    repo.owned = { id: 'app-1', position_id: 'pos-1', reversed_at: new Date() };
    const { service, recalced } = makeService(repo);
    await assert.rejects(() => service.reverse('u1', 'tok', 'app-1', null), /already reversed/);
    assert.equal(repo.reversedId, undefined);
    assert.deepEqual(recalced, []);
  });
});
