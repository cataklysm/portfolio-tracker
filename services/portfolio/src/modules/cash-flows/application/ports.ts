import type { AuditFn } from '../../audit/application/ports.js';
import type { TaxComponent } from '../../tax-events/application/ports.js';

export type CashFlowType = 'dividend' | 'deposit' | 'withdrawal' | 'cash_in_lieu' | 'interest';

/** A withheld-tax component captured with an income cash flow (cash-flow currency). */
export interface NewIncomeTaxComponent {
  component: TaxComponent;
  amount: string;
  bookingDate: string;
}

/** A stored cash flow as served to its owner. */
export interface CashFlowRecord {
  id: string;
  portfolio_id: string;
  position_id: string | null;
  type: CashFlowType;
  gross_amount: string;
  withholding_tax: string;
  fee: string;
  net_amount: string;
  currency: string;
  payment_date: string;
  tax_relevant_value_date: string;
  note: string | null;
  /** Canonical external `events` corporate-action handle (string id + version). */
  source_event_id: string | null;
  source_event_version: number | null;
  source_event_type: string | null;
  /** Ex-date and per-share economics captured at booking, for event-linked income. */
  ex_date: string | null;
  amount_per_share: string | null;
  quantity_at_ex_date: string | null;
  expected_gross_amount: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewCashFlow {
  userId: string;
  portfolioId: string;
  positionId: string | null;
  type: CashFlowType;
  grossAmount: string;
  withholdingTax: string;
  fee: string;
  netAmount: string;
  currency: string;
  paymentDate: string;
  taxRelevantValueDate: string;
  note: string | null;
  sourceEventId: string | null;
  sourceEventVersion: number | null;
  sourceEventType: string | null;
  exDate: string | null;
  amountPerShare: string | null;
  quantityAtExDate: string | null;
  expectedGrossAmount: string | null;
}

export interface UpdateCashFlow {
  grossAmount?: string;
  withholdingTax?: string;
  fee?: string;
  netAmount?: string;
  currency?: string;
  paymentDate?: string;
  taxRelevantValueDate?: string;
  note?: string | null;
}

export interface CashFlowRepository {
  create(input: NewCashFlow, audit?: AuditFn<CashFlowRecord>): Promise<CashFlowRecord>;
  /**
   * Creates an income cash flow and its linked withheld-tax events
   * (`source = 'income_booking'`, `direction = 'withheld'`) in one transaction,
   * with audit rows for the cash flow and every tax event.
   */
  createWithTaxEvents(
    input: NewCashFlow,
    taxComponents: NewIncomeTaxComponent[],
    audit?: AuditFn<CashFlowRecord>,
  ): Promise<CashFlowRecord>;
  /**
   * Cash flows for one owned portfolio, optionally filtered by type(s), position,
   * and a `tax_relevant_value_date` range (`dateFrom`/`dateTo` inclusive).
   */
  listForPortfolio(
    userId: string,
    portfolioId: string,
    filter: { types?: CashFlowType[]; positionId?: string; dateFrom?: string; dateTo?: string },
  ): Promise<CashFlowRecord[]>;
  /** All cash flows for a user (optionally one portfolio) — used by reporting. */
  listForUser(userId: string, portfolioId?: string): Promise<CashFlowRecord[]>;
  get(userId: string, id: string): Promise<CashFlowRecord | null>;
  update(
    userId: string,
    id: string,
    patch: UpdateCashFlow,
    audit?: AuditFn<CashFlowRecord | null>,
  ): Promise<CashFlowRecord | null>;
  delete(userId: string, id: string, audit?: AuditFn<boolean>): Promise<boolean>;
  /** True when the portfolio exists and belongs to the user. */
  assertPortfolioOwned(userId: string, portfolioId: string): Promise<boolean>;
  /** The owning portfolio of a position, if it belongs to the user; else null. */
  positionPortfolio(userId: string, positionId: string): Promise<string | null>;
  /** True when the cash flow has generated `income_booking` tax events attached. */
  hasManagedTaxEvents(userId: string, cashFlowId: string): Promise<boolean>;
}

/** Reads the split-adjusted open quantity of an owned position as of a date. */
export interface PositionQuantityReader {
  getOpenQuantityAsOf(userId: string, positionId: string, asOf: string): Promise<string>;
}
