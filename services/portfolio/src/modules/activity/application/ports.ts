export type ActivityKind = 'trade' | 'cash_flow' | 'tax_event' | 'corporate_action' | 'transfer';

/** A raw unified activity row as projected by the union read model. */
export interface ActivityRow {
  id: string;
  kind: ActivityKind;
  occurred_at: Date;
  portfolio_id: string | null;
  position_id: string | null;
  /**
   * Kind-specific subtype: trade side, cash-flow type, tax component,
   * 'split'/'reverse_split' (corporate action), or 'transfer'.
   */
  subtype: string;
  /** Settlement currency; null for non-monetary events (corporate action, transfer). */
  currency: string | null;
  /**
   * Trade consideration (qty × price), cash-flow net amount, or tax amount;
   * null for non-monetary events (corporate action, transfer).
   */
  amount: string | null;
  /** Trade quantity, or a corporate action's ratio numerator. */
  quantity: string | null;
  /** Trade price, or a corporate action's ratio denominator. */
  price: string | null;
  fee: string | null;
  /** Tax direction (withheld/refunded), or 'reversed' for an undone corporate action; null otherwise. */
  direction: string | null;
  note: string | null;
}

/** Keyset cursor position: rows strictly before this (occurred_at, id) come next. */
export interface ActivityCursor {
  occurredAt: string;
  id: string;
}

export interface ActivityQuery {
  userId: string;
  portfolioId?: string;
  kind?: ActivityKind;
  before?: ActivityCursor;
  /** Maximum rows to return (the service requests one extra to detect more). */
  limit: number;
}

export interface ActivityRepository {
  /** Rows ordered by (occurred_at DESC, id DESC), filtered + keyset-paginated. */
  list(query: ActivityQuery): Promise<ActivityRow[]>;
}
