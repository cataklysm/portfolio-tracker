export type ActivityKind = 'trade' | 'cash_flow' | 'tax_event';

/** A raw unified activity row as projected by the union read model. */
export interface ActivityRow {
  id: string;
  kind: ActivityKind;
  occurred_at: Date;
  portfolio_id: string | null;
  position_id: string | null;
  /** Kind-specific subtype: trade side, cash-flow type, or tax component. */
  subtype: string;
  currency: string;
  /** Trade consideration (qty × price), cash-flow net amount, or tax amount. */
  amount: string;
  quantity: string | null;
  price: string | null;
  fee: string | null;
  /** Tax-event direction (withheld/refunded); null otherwise. */
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
