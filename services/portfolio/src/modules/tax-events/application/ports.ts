import type { AuditFn } from '../../audit/application/ports.js';

export type TaxComponent =
  | 'capital_income'
  | 'solidarity'
  | 'church'
  | 'foreign_withholding'
  | 'generic';

export type TaxDirection = 'withheld' | 'refunded';

export type TaxSource = 'manual' | 'import' | 'broker_api' | 'provider' | 'corporate_action';

/** Optional attribution links; any combination (including none) is valid. */
export interface TaxEventLinks {
  transaction_id: string | null;
  cash_flow_id: string | null;
  position_id: string | null;
  portfolio_id: string | null;
}

/** A stored broker tax event as served to its owner. */
export interface TaxEventRecord extends TaxEventLinks {
  id: string;
  component: TaxComponent;
  direction: TaxDirection;
  amount: string;
  currency: string;
  booking_date: string;
  source: TaxSource;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewTaxEvent {
  userId: string;
  component: TaxComponent;
  direction: TaxDirection;
  amount: string;
  currency: string;
  bookingDate: string;
  source: TaxSource;
  note: string | null;
  transactionId: string | null;
  cashFlowId: string | null;
  positionId: string | null;
  portfolioId: string | null;
}

export interface UpdateTaxEvent {
  component?: TaxComponent;
  direction?: TaxDirection;
  amount?: string;
  currency?: string;
  bookingDate?: string;
  note?: string | null;
}

export interface TaxEventFilter {
  portfolioId?: string;
  positionId?: string;
  transactionId?: string;
  cashFlowId?: string;
}

export interface TaxEventRepository {
  create(input: NewTaxEvent, audit?: AuditFn<TaxEventRecord>): Promise<TaxEventRecord>;
  /** A user's tax events, optionally filtered by an attribution link. */
  listForUser(userId: string, filter: TaxEventFilter): Promise<TaxEventRecord[]>;
  /** A user's tax events linked to any of the given transaction IDs. */
  listForTransactions(userId: string, transactionIds: string[]): Promise<TaxEventRecord[]>;
  get(userId: string, id: string): Promise<TaxEventRecord | null>;
  update(
    userId: string,
    id: string,
    patch: UpdateTaxEvent,
    audit?: AuditFn<TaxEventRecord | null>,
  ): Promise<TaxEventRecord | null>;
  delete(userId: string, id: string, audit?: AuditFn<boolean>): Promise<boolean>;
  /** True when the portfolio exists and belongs to the user. */
  assertPortfolioOwned(userId: string, portfolioId: string): Promise<boolean>;
  /** The owning portfolio of a position the user owns, else null. */
  positionPortfolio(userId: string, positionId: string): Promise<string | null>;
  /** The owning portfolio of a transaction the user owns, else null. */
  transactionPortfolio(userId: string, transactionId: string): Promise<string | null>;
  /** The owning portfolio of a cash flow the user owns, else null. */
  cashFlowPortfolio(userId: string, cashFlowId: string): Promise<string | null>;
}
