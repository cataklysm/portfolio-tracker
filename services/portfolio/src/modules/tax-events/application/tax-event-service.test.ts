import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TaxEventService } from './tax-event-service.js';
import type {
  NewTaxEvent,
  TaxEventFilter,
  TaxEventRecord,
  TaxEventRepository,
  UpdateTaxEvent,
} from './ports.js';

const USER = 'user-1';
const PORTFOLIO = 'pf-1';
const POSITION = 'pos-1';
const POSITION_PORTFOLIO = 'pf-pos';
const TRANSACTION = 'tx-1';
const TRANSACTION_PORTFOLIO = 'pf-tx';
const CASH_FLOW = 'cf-1';
const CASH_FLOW_PORTFOLIO = 'pf-cf';

/** In-memory repository with fixed ownership of one of each linkable resource. */
class FakeRepo implements TaxEventRepository {
  store = new Map<string, TaxEventRecord>();
  private seq = 0;

  async create(input: NewTaxEvent): Promise<TaxEventRecord> {
    const id = `te-${++this.seq}`;
    const record: TaxEventRecord = {
      id,
      component: input.component,
      direction: input.direction,
      amount: input.amount,
      currency: input.currency,
      booking_date: input.bookingDate,
      source: input.source,
      note: input.note,
      transaction_id: input.transactionId,
      cash_flow_id: input.cashFlowId,
      position_id: input.positionId,
      portfolio_id: input.portfolioId,
      created_at: 'now',
      updated_at: 'now',
    };
    this.store.set(id, record);
    return record;
  }
  async listForUser(_userId: string, _filter: TaxEventFilter): Promise<TaxEventRecord[]> {
    return [...this.store.values()];
  }
  async listForTransactions(_userId: string, transactionIds: string[]): Promise<TaxEventRecord[]> {
    return [...this.store.values()].filter((e) => e.transaction_id !== null && transactionIds.includes(e.transaction_id));
  }
  async get(_userId: string, id: string): Promise<TaxEventRecord | null> {
    return this.store.get(id) ?? null;
  }
  async update(_userId: string, id: string, patch: UpdateTaxEvent): Promise<TaxEventRecord | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: TaxEventRecord = {
      ...existing,
      component: patch.component ?? existing.component,
      direction: patch.direction ?? existing.direction,
      amount: patch.amount ?? existing.amount,
      currency: patch.currency ?? existing.currency,
      booking_date: patch.bookingDate ?? existing.booking_date,
      note: patch.note === undefined ? existing.note : patch.note,
    };
    this.store.set(id, updated);
    return updated;
  }
  async delete(_userId: string, id: string): Promise<boolean> {
    return this.store.delete(id);
  }
  async assertPortfolioOwned(_userId: string, portfolioId: string): Promise<boolean> {
    return portfolioId === PORTFOLIO;
  }
  async positionPortfolio(_userId: string, positionId: string): Promise<string | null> {
    return positionId === POSITION ? POSITION_PORTFOLIO : null;
  }
  async transactionPortfolio(_userId: string, transactionId: string): Promise<string | null> {
    return transactionId === TRANSACTION ? TRANSACTION_PORTFOLIO : null;
  }
  async cashFlowPortfolio(_userId: string, cashFlowId: string): Promise<string | null> {
    return cashFlowId === CASH_FLOW ? CASH_FLOW_PORTFOLIO : null;
  }
}

const rejectsWith = async (code: string, fn: () => Promise<unknown>): Promise<void> => {
  await assert.rejects(fn, (e: { code?: string }) => e.code === code);
};

describe('TaxEventService', () => {
  test('creates a standalone correction with normalized currency and no links', async () => {
    const svc = new TaxEventService(new FakeRepo());
    const e = await svc.create(USER, {
      component: 'generic',
      direction: 'withheld',
      amount: '12.5',
      currency: 'eur',
      bookingDate: '2025-12-31',
    });
    assert.equal(e.currency, 'EUR');
    assert.equal(e.portfolio_id, null);
    assert.equal(e.source, 'manual');
  });

  test('derives the scoping portfolio from a linked position', async () => {
    const svc = new TaxEventService(new FakeRepo());
    const e = await svc.create(USER, {
      component: 'capital_income', direction: 'withheld', amount: '100', currency: 'EUR', bookingDate: '2025-05-15', positionId: POSITION,
    });
    assert.equal(e.portfolio_id, POSITION_PORTFOLIO);
    assert.equal(e.position_id, POSITION);
  });

  test('an explicit owned portfolio takes precedence over a link', async () => {
    const svc = new TaxEventService(new FakeRepo());
    const e = await svc.create(USER, {
      component: 'capital_income', direction: 'withheld', amount: '100', currency: 'EUR', bookingDate: '2025-05-15', positionId: POSITION, portfolioId: PORTFOLIO,
    });
    assert.equal(e.portfolio_id, PORTFOLIO);
  });

  test('derives portfolio from a linked transaction or cash flow', async () => {
    const svc = new TaxEventService(new FakeRepo());
    const fromTx = await svc.create(USER, { component: 'capital_income', direction: 'withheld', amount: '10', currency: 'EUR', bookingDate: '2025-05-15', transactionId: TRANSACTION });
    assert.equal(fromTx.portfolio_id, TRANSACTION_PORTFOLIO);
    const fromCf = await svc.create(USER, { component: 'capital_income', direction: 'withheld', amount: '10', currency: 'EUR', bookingDate: '2025-05-15', cashFlowId: CASH_FLOW });
    assert.equal(fromCf.portfolio_id, CASH_FLOW_PORTFOLIO);
  });

  test('rejects unknown links, bad amounts, and bad currency', async () => {
    const svc = new TaxEventService(new FakeRepo());
    const base = { component: 'capital_income', direction: 'withheld', currency: 'EUR', bookingDate: '2025-05-15' } as const;
    await rejectsWith('portfolio_not_found', () => svc.create(USER, { ...base, amount: '10', portfolioId: 'other' }));
    await rejectsWith('position_not_found', () => svc.create(USER, { ...base, amount: '10', positionId: 'other' }));
    await rejectsWith('transaction_not_found', () => svc.create(USER, { ...base, amount: '10', transactionId: 'other' }));
    await rejectsWith('invalid_amount', () => svc.create(USER, { ...base, amount: '-1' }));
    await rejectsWith('invalid_currency', () => svc.create(USER, { ...base, amount: '10', currency: 'EURO' }));
    await rejectsWith('invalid_date', () => svc.create(USER, { ...base, amount: '10', bookingDate: '2025-5-1' }));
  });

  test('update changes classification and amount; delete removes', async () => {
    const repo = new FakeRepo();
    const svc = new TaxEventService(repo);
    const e = await svc.create(USER, { component: 'generic', direction: 'withheld', amount: '40', currency: 'EUR', bookingDate: '2025-12-31' });
    const updated = await svc.update(USER, e.id, { component: 'capital_income', amount: '45' });
    assert.equal(updated.component, 'capital_income');
    assert.equal(updated.amount, '45');
    await svc.delete(USER, e.id);
    await rejectsWith('tax_event_not_found', () => svc.update(USER, e.id, { amount: '1' }));
  });
});
