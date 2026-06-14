import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CashFlowService } from './cash-flow-service.js';
import type { CashFlowRecord, CashFlowRepository, NewCashFlow, UpdateCashFlow } from './ports.js';

const USER = 'user-1';
const PORTFOLIO = 'pf-1';
const POSITION = 'pos-1';

/** Minimal in-memory repository: ownership for one portfolio + one position. */
class FakeRepo implements CashFlowRepository {
  store = new Map<string, CashFlowRecord>();
  private seq = 0;

  async create(input: NewCashFlow): Promise<CashFlowRecord> {
    const id = `cf-${++this.seq}`;
    const record: CashFlowRecord = {
      id,
      portfolio_id: input.portfolioId,
      position_id: input.positionId,
      type: input.type,
      gross_amount: input.grossAmount,
      withholding_tax: input.withholdingTax,
      fee: input.fee,
      net_amount: input.netAmount,
      currency: input.currency,
      payment_date: input.paymentDate,
      tax_relevant_value_date: input.taxRelevantValueDate,
      note: input.note,
      created_at: 'now',
      updated_at: 'now',
    };
    this.store.set(id, record);
    return record;
  }
  async listForPortfolio(): Promise<CashFlowRecord[]> { return [...this.store.values()]; }
  async listForUser(): Promise<CashFlowRecord[]> { return [...this.store.values()]; }
  async get(_userId: string, id: string): Promise<CashFlowRecord | null> { return this.store.get(id) ?? null; }
  async update(_userId: string, id: string, patch: UpdateCashFlow): Promise<CashFlowRecord | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: CashFlowRecord = {
      ...existing,
      gross_amount: patch.grossAmount ?? existing.gross_amount,
      withholding_tax: patch.withholdingTax ?? existing.withholding_tax,
      fee: patch.fee ?? existing.fee,
      net_amount: patch.netAmount ?? existing.net_amount,
    };
    this.store.set(id, updated);
    return updated;
  }
  async delete(_userId: string, id: string): Promise<boolean> { return this.store.delete(id); }
  async assertPortfolioOwned(_userId: string, portfolioId: string): Promise<boolean> { return portfolioId === PORTFOLIO; }
  async positionPortfolio(_userId: string, positionId: string): Promise<string | null> {
    return positionId === POSITION ? PORTFOLIO : null;
  }
}

const rejectsWith = async (code: string, fn: () => Promise<unknown>): Promise<void> => {
  await assert.rejects(fn, (e: { code?: string }) => e.code === code);
};

describe('CashFlowService', () => {
  test('derives net = gross − withholding − fee and normalizes currency', async () => {
    const svc = new CashFlowService(new FakeRepo());
    const cf = await svc.create(USER, PORTFOLIO, {
      type: 'dividend', grossAmount: '100', withholdingTax: '26.375', fee: '1',
      currency: 'eur', paymentDate: '2025-05-15', positionId: POSITION,
    });
    assert.equal(cf.net_amount, '72.625');
    assert.equal(cf.currency, 'EUR');
    assert.equal(cf.tax_relevant_value_date, '2025-05-15'); // defaults to payment date
    assert.equal(cf.position_id, POSITION);
  });

  test('portfolio-level deposit has no position and net = gross', async () => {
    const svc = new CashFlowService(new FakeRepo());
    const cf = await svc.create(USER, PORTFOLIO, { type: 'deposit', grossAmount: '5000', currency: 'EUR', paymentDate: '2025-01-02' });
    assert.equal(cf.net_amount, '5000');
    assert.equal(cf.position_id, null);
  });

  test('enforces the position-linkage rules', async () => {
    const svc = new CashFlowService(new FakeRepo());
    await rejectsWith('position_required', () =>
      svc.create(USER, PORTFOLIO, { type: 'dividend', grossAmount: '10', currency: 'EUR', paymentDate: '2025-05-15' }));
    await rejectsWith('position_not_allowed', () =>
      svc.create(USER, PORTFOLIO, { type: 'deposit', grossAmount: '10', currency: 'EUR', paymentDate: '2025-05-15', positionId: POSITION }));
  });

  test('rejects unknown portfolio, negative withholding, and bad currency', async () => {
    const svc = new CashFlowService(new FakeRepo());
    await rejectsWith('portfolio_not_found', () =>
      svc.create(USER, 'other', { type: 'deposit', grossAmount: '10', currency: 'EUR', paymentDate: '2025-05-15' }));
    await rejectsWith('invalid_amount', () =>
      svc.create(USER, PORTFOLIO, { type: 'deposit', grossAmount: '10', withholdingTax: '-1', currency: 'EUR', paymentDate: '2025-05-15' }));
    await rejectsWith('invalid_currency', () =>
      svc.create(USER, PORTFOLIO, { type: 'deposit', grossAmount: '10', currency: 'EURO', paymentDate: '2025-05-15' }));
  });

  test('update recomputes net from changed components', async () => {
    const repo = new FakeRepo();
    const svc = new CashFlowService(repo);
    const cf = await svc.create(USER, PORTFOLIO, { type: 'dividend', grossAmount: '100', withholdingTax: '26.375', fee: '1', currency: 'EUR', paymentDate: '2025-05-15', positionId: POSITION });
    const updated = await svc.update(USER, cf.id, { fee: '5' });
    assert.equal(updated.net_amount, '68.625'); // 100 - 26.375 - 5
  });
});
