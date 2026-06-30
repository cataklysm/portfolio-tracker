import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CashFlowService } from './cash-flow-service.js';
import type { CashFlowRecord, CashFlowRepository, NewCashFlow, NewIncomeTaxComponent, PositionQuantityReader, UpdateCashFlow } from './ports.js';

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
      source_event_id: input.sourceEventId,
      source_event_version: input.sourceEventVersion,
      source_event_type: input.sourceEventType,
      ex_date: input.exDate,
      amount_per_share: input.amountPerShare,
      quantity_at_ex_date: input.quantityAtExDate,
      expected_gross_amount: input.expectedGrossAmount,
      created_at: 'now',
      updated_at: 'now',
    };
    this.store.set(id, record);
    return record;
  }
  taxEvents: NewIncomeTaxComponent[] = [];
  managed = new Set<string>();
  async createWithTaxEvents(input: NewCashFlow, taxComponents: NewIncomeTaxComponent[]): Promise<CashFlowRecord> {
    this.taxEvents.push(...taxComponents);
    const cf = await this.create(input);
    if (taxComponents.length > 0) this.managed.add(cf.id);
    return cf;
  }
  async hasManagedTaxEvents(_userId: string, cashFlowId: string): Promise<boolean> {
    return this.managed.has(cashFlowId);
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

/** Open-quantity reader stub returning a fixed held quantity at any ex-date. */
class FakeQuantityReader implements PositionQuantityReader {
  constructor(private readonly qty: string) {}
  async getOpenQuantityAsOf(): Promise<string> {
    return this.qty;
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

  test('books portfolio-level interest with no position', async () => {
    const svc = new CashFlowService(new FakeRepo());
    const cf = await svc.create(USER, PORTFOLIO, {
      type: 'interest', grossAmount: '12.50', withholdingTax: '3.30', currency: 'EUR', paymentDate: '2026-03-31',
    });
    assert.equal(cf.type, 'interest');
    assert.equal(cf.position_id, null);
    assert.equal(cf.net_amount, '9.2'); // 12.50 - 3.30, no fee
  });

  test('allows interest attached to an owned position in the same portfolio', async () => {
    const svc = new CashFlowService(new FakeRepo());
    const cf = await svc.create(USER, PORTFOLIO, {
      type: 'interest', grossAmount: '5', currency: 'EUR', paymentDate: '2026-03-31', positionId: POSITION,
    });
    assert.equal(cf.position_id, POSITION); // position is optional for interest, validated when given
  });

  test('event-linked dividend stores metadata and computes quantity + expected gross', async () => {
    const svc = new CashFlowService(new FakeRepo(), new FakeQuantityReader('100'));
    const cf = await svc.create(USER, PORTFOLIO, {
      type: 'dividend', grossAmount: '50', currency: 'EUR', paymentDate: '2026-06-30', positionId: POSITION,
      sourceEventId: 'evt-1', sourceEventVersion: 2, exDate: '2026-06-25', amountPerShare: '0.50',
    });
    assert.equal(cf.source_event_id, 'evt-1');
    assert.equal(cf.source_event_version, 2);
    assert.equal(cf.ex_date, '2026-06-25');
    assert.equal(cf.quantity_at_ex_date, '100'); // from the position ledger at ex-date
    assert.equal(cf.expected_gross_amount, '50'); // 0.50 × 100
  });

  test('rejects source_event_id on a non-position income type', async () => {
    const svc = new CashFlowService(new FakeRepo(), new FakeQuantityReader('100'));
    await rejectsWith('event_link_unsupported', () =>
      svc.create(USER, PORTFOLIO, { type: 'deposit', grossAmount: '10', currency: 'EUR', paymentDate: '2026-06-30', sourceEventId: 'evt-1', exDate: '2026-06-25' }));
  });

  test('rejects an event link without an ex-date', async () => {
    const svc = new CashFlowService(new FakeRepo(), new FakeQuantityReader('100'));
    await rejectsWith('ex_date_required', () =>
      svc.create(USER, PORTFOLIO, { type: 'dividend', grossAmount: '10', currency: 'EUR', paymentDate: '2026-06-30', positionId: POSITION, sourceEventId: 'evt-1' }));
  });

  test('tax components set withholding = their sum and create linked tax events', async () => {
    const repo = new FakeRepo();
    const svc = new CashFlowService(repo);
    const cf = await svc.create(USER, PORTFOLIO, {
      type: 'dividend', grossAmount: '22.00', currency: 'EUR', paymentDate: '2026-06-30', positionId: POSITION,
      taxComponents: [
        { component: 'capital_income', amount: '5.50', currency: 'EUR', bookingDate: '2026-06-30' },
        { component: 'solidarity', amount: '0.30', currency: 'EUR', bookingDate: '2026-06-30' },
      ],
    });
    assert.equal(cf.withholding_tax, '5.8'); // 5.50 + 0.30
    assert.equal(cf.net_amount, '16.2'); // 22 − 5.8 − 0 fee
    assert.equal(repo.taxEvents.length, 2);
  });

  test('rejects tax components in a foreign currency (MVP)', async () => {
    const svc = new CashFlowService(new FakeRepo());
    await rejectsWith('tax_component_currency_mismatch', () =>
      svc.create(USER, PORTFOLIO, { type: 'dividend', grossAmount: '22', currency: 'EUR', paymentDate: '2026-06-30', positionId: POSITION,
        taxComponents: [{ component: 'capital_income', amount: '5', currency: 'USD', bookingDate: '2026-06-30' }] }));
  });

  test('rejects tax components together with an explicit withholding_tax', async () => {
    const svc = new CashFlowService(new FakeRepo());
    await rejectsWith('withholding_conflict', () =>
      svc.create(USER, PORTFOLIO, { type: 'dividend', grossAmount: '22', withholdingTax: '5', currency: 'EUR', paymentDate: '2026-06-30', positionId: POSITION,
        taxComponents: [{ component: 'capital_income', amount: '5', currency: 'EUR', bookingDate: '2026-06-30' }] }));
  });

  test('rejects tax components on a non-income cash-flow type', async () => {
    const svc = new CashFlowService(new FakeRepo());
    await rejectsWith('tax_components_unsupported', () =>
      svc.create(USER, PORTFOLIO, { type: 'deposit', grossAmount: '22', currency: 'EUR', paymentDate: '2026-06-30',
        taxComponents: [{ component: 'capital_income', amount: '5', currency: 'EUR', bookingDate: '2026-06-30' }] }));
  });

  test('rejects a withholding_tax patch on a booking with generated tax events', async () => {
    const repo = new FakeRepo();
    const svc = new CashFlowService(repo);
    const cf = await svc.create(USER, PORTFOLIO, {
      type: 'dividend', grossAmount: '22', currency: 'EUR', paymentDate: '2026-06-30', positionId: POSITION,
      taxComponents: [{ component: 'capital_income', amount: '5', currency: 'EUR', bookingDate: '2026-06-30' }],
    });
    await rejectsWith('withholding_managed', () => svc.update(USER, cf.id, { withholdingTax: '7' }));
    // Patches that don't touch withholding_tax are still allowed.
    await assert.doesNotReject(() => svc.update(USER, cf.id, { note: 'ok' }));
  });
});
