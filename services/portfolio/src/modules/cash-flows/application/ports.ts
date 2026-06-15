import type { AuditFn } from '../../audit/application/ports.js';

export type CashFlowType = 'dividend' | 'deposit' | 'withdrawal' | 'cash_in_lieu';

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
  /** Cash flows for one owned portfolio, optionally filtered by type/position. */
  listForPortfolio(
    userId: string,
    portfolioId: string,
    filter: { type?: CashFlowType; positionId?: string },
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
}
