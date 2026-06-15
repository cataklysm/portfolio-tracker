import type { BookingSource } from '../../../platform/database/schema.js';

export type { BookingSource };
export type ChangeEntityType = 'transaction' | 'cash_flow' | 'tax_event';
export type ChangeAction = 'created' | 'updated' | 'deleted';

/** A change to append to the immutable booking-change log. */
export interface NewBookingChange {
  userId: string;
  entityType: ChangeEntityType;
  entityId: string;
  action: ChangeAction;
  source?: BookingSource;
  reason?: string | null;
  /** Entity snapshot before the change (null for a creation). */
  before?: unknown;
  /** Entity snapshot after the change (null for a deletion). */
  after?: unknown;
  portfolioId?: string | null;
  positionId?: string | null;
}

/** A stored change-log entry as served to its owner. */
export interface BookingChange {
  id: string;
  entity_type: ChangeEntityType;
  entity_id: string;
  action: ChangeAction;
  source: BookingSource;
  reason: string | null;
  before: unknown | null;
  after: unknown | null;
  portfolio_id: string | null;
  position_id: string | null;
  changed_at: string;
}

export interface ChangeLogFilter {
  entityType?: ChangeEntityType;
  entityId?: string;
  portfolioId?: string;
}

/** Appends to the audit log in its own statement (no surrounding transaction). */
export interface ChangeLogWriter {
  record(change: NewBookingChange): Promise<void>;
}

/**
 * Builds the change-log entry for a write from its result, or `null` to record
 * nothing (e.g. a delete that matched no row). A repository given an
 * {@link ChangeLogWriter}-backed recorder persists the returned entry in the
 * same transaction as the write, so the two commit (or roll back) together.
 */
export type AuditFn<T> = (result: T) => NewBookingChange | null;

export interface ChangeLogReader {
  list(userId: string, filter: ChangeLogFilter): Promise<BookingChange[]>;
}
