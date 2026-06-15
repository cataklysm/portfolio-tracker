import type { ActivityKind, ActivityRepository, ActivityRow } from './ports.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** A serialized activity item as returned over HTTP. */
export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  occurred_at: string;
  portfolio_id: string | null;
  position_id: string | null;
  subtype: string;
  currency: string;
  amount: string;
  quantity: string | null;
  price: string | null;
  fee: string | null;
  direction: string | null;
  note: string | null;
}

export interface ActivityPage {
  items: ActivityItem[];
  /** Opaque cursor to fetch the next (older) page, or null when exhausted. */
  next_cursor: string | null;
}

export interface ActivityListOptions {
  portfolioId?: string;
  kind?: ActivityKind;
  cursor?: string | null;
  limit?: number;
}

/**
 * Reads the cross-portfolio activity feed: a single chronological, keyset-paginated
 * stream merging trades, cash flows, and tax events. The repository does the
 * union and ordering; this layer handles cursor encoding and the has-more probe
 * (it asks for one extra row, then trims).
 */
export class ActivityService {
  constructor(private readonly repo: ActivityRepository) {}

  async list(userId: string, options: ActivityListOptions = {}): Promise<ActivityPage> {
    const limit = clampLimit(options.limit);
    const before = options.cursor ? decodeCursor(options.cursor) : undefined;

    const rows = await this.repo.list({
      userId,
      portfolioId: options.portfolioId,
      kind: options.kind,
      before,
      limit: limit + 1, // one extra row tells us whether another page exists
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const next_cursor = hasMore && last ? encodeCursor(last) : null;

    return { items: page.map(toItem), next_cursor };
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function toItem(row: ActivityRow): ActivityItem {
  return {
    id: row.id,
    kind: row.kind,
    occurred_at: row.occurred_at.toISOString(),
    portfolio_id: row.portfolio_id,
    position_id: row.position_id,
    subtype: row.subtype,
    currency: row.currency,
    amount: row.amount,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    direction: row.direction,
    note: row.note,
  };
}

/** Encodes a keyset cursor as base64url of `${occurredAtIso}|${id}`. */
export function encodeCursor(row: Pick<ActivityRow, 'occurred_at' | 'id'>): string {
  return Buffer.from(`${row.occurred_at.toISOString()}|${row.id}`, 'utf8').toString('base64url');
}

/** Decodes a cursor; returns undefined for a malformed value (treated as no cursor). */
export function decodeCursor(cursor: string): { occurredAt: string; id: string } | undefined {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = decoded.indexOf('|');
    if (sep <= 0) return undefined;
    const occurredAt = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    if (!occurredAt || !id || Number.isNaN(Date.parse(occurredAt))) return undefined;
    return { occurredAt, id };
  } catch {
    return undefined;
  }
}
