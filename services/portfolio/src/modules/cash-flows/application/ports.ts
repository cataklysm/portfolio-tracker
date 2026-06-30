import type { AuditFn } from '../../audit/application/ports.js';
import type { TaxComponent } from '../../tax-events/application/ports.js';

export type CashFlowType = 'dividend' | 'deposit' | 'withdrawal' | 'cash_in_lieu' | 'interest';

/**
 * A withheld-tax component captured with an income cash flow, normalized to carry
 * both the original source-currency amount and the broker-settled settlement amount.
 * For same-currency bookings the two are equal. The linked `tax_events` row stores
 * the settlement amount/currency; the source detail is preserved in
 * `cash_flow_tax_components`.
 */
export interface NewIncomeTaxComponent {
  component: TaxComponent;
  sourceAmount: string;
  sourceCurrency: string;
  settlementAmount: string;
  settlementCurrency: string;
  bookingDate: string;
}

/**
 * Withheld-tax component as supplied on a create request. Two accepted shapes,
 * discriminated at runtime by which fields are present:
 *   - same-currency (legacy): `{ component, amount, currency, bookingDate }`
 *   - cross-currency: `{ component, sourceAmount, sourceCurrency, settlementAmount,
 *     settlementCurrency, bookingDate }`
 */
export interface IncomeTaxComponentInput {
  component: TaxComponent;
  bookingDate: string;
  amount?: string;
  currency?: string;
  sourceAmount?: string;
  sourceCurrency?: string;
  settlementAmount?: string;
  settlementCurrency?: string;
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
  // Foreign-currency income: source economics in the original currency. Null for
  // same-currency bookings. Settlement fields above stay the reconciled amounts.
  source_currency: string | null;
  source_gross_amount: string | null;
  source_withholding_tax: string | null;
  source_fee: string | null;
  source_net_amount: string | null;
  source_amount_per_share: string | null;
  // The broker's fixed conversion, as a direct source->settlement rate.
  broker_fx_rate: string | null;
  broker_fx_from_currency: string | null;
  broker_fx_to_currency: string | null;
  broker_fx_rate_date: string | null;
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
  sourceCurrency: string | null;
  sourceGrossAmount: string | null;
  sourceWithholdingTax: string | null;
  sourceFee: string | null;
  sourceNetAmount: string | null;
  sourceAmountPerShare: string | null;
  brokerFxRate: string | null;
  brokerFxFromCurrency: string | null;
  brokerFxToCurrency: string | null;
  brokerFxRateDate: string | null;
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

/**
 * Read-only comparison of the broker's fixed FX against the market reference rate,
 * computed on read for foreign-currency bookings. All amounts are in the settlement
 * currency. `status` is `same_currency` (no source layer), `available`, or
 * `unavailable` (reference rate missing — the read still succeeds).
 */
export interface CashFlowFxComparison {
  reference_fx_rate: string | null;
  reference_fx_rate_date: string | null;
  reference_fx_net_amount: string | null;
  broker_fx_difference_amount: string | null;
  broker_fx_difference_pct: string | null;
  fx_comparison_status: 'same_currency' | 'available' | 'unavailable';
}

/** A cash flow as served on read: the stored record plus the broker-vs-reference FX comparison. */
export type CashFlowView = CashFlowRecord & CashFlowFxComparison;

/** A (currency, value date) pair to resolve a historical EUR-based rate for. */
export interface DatedRateRequest {
  currency: string;
  date: string;
}

/**
 * Reads historical EUR-based FX rates (units of currency per 1 EUR) keyed
 * `${currency}@${date}` for the broker-vs-reference comparison. Structurally
 * satisfied by the shared market FX client; EUR is the implicit pivot (rate 1).
 */
export interface FxRateReader {
  getEurRatesAt(requests: DatedRateRequest[], bearerToken: string): Promise<Map<string, string>>;
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
