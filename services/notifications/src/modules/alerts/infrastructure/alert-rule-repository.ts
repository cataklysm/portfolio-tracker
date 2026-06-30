import type { Kysely } from 'kysely';
import type { NotificationsDatabase } from '../../../platform/database/schema.js';
import type { AlertRule, AlertRuleRepository, NewAlertRule, UpdateAlertRule } from '../application/ports.js';

interface RuleRow {
  id: string;
  user_id: string;
  kind: AlertRule['kind'];
  instrument_id: string;
  listing_id: string | null;
  params: unknown;
  label: string | null;
  enabled: boolean;
  notify_once: boolean;
  created_at: Date;
  updated_at: Date;
}

/** Kysely adapter for `notifications.alert_rules` (user-defined alert rules). */
export class KyselyAlertRuleRepository implements AlertRuleRepository {
  constructor(private readonly db: Kysely<NotificationsDatabase>) {}

  async create(input: NewAlertRule): Promise<AlertRule> {
    const row = await this.db
      .insertInto('notifications.alert_rules')
      .values({
        user_id: input.userId,
        kind: input.kind,
        instrument_id: input.instrumentId,
        listing_id: input.listingId,
        params: JSON.stringify(input.params),
        label: input.label,
        notify_once: input.notifyOnce,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRule(row as RuleRow);
  }

  async listByUser(userId: string, filter?: { instrumentId?: string; listingId?: string }): Promise<AlertRule[]> {
    let query = this.db
      .selectFrom('notifications.alert_rules')
      .selectAll()
      .where('user_id', '=', userId);
    if (filter?.instrumentId) query = query.where('instrument_id', '=', filter.instrumentId);
    if (filter?.listingId) query = query.where('listing_id', '=', filter.listingId);
    const rows = await query.orderBy('created_at', 'desc').execute();
    return rows.map((r) => toRule(r as RuleRow));
  }

  async listEnabled(userId: string): Promise<AlertRule[]> {
    const rows = await this.db
      .selectFrom('notifications.alert_rules')
      .selectAll()
      .where('user_id', '=', userId)
      .where('enabled', '=', true)
      .execute();
    return rows.map((r) => toRule(r as RuleRow));
  }

  async update(userId: string, id: string, patch: UpdateAlertRule): Promise<AlertRule | null> {
    const values: Record<string, unknown> = { updated_at: new Date() };
    if (patch.params !== undefined) values.params = JSON.stringify(patch.params);
    if (patch.label !== undefined) values.label = patch.label;
    if (patch.enabled !== undefined) values.enabled = patch.enabled;
    if (patch.notifyOnce !== undefined) values.notify_once = patch.notifyOnce;

    const row = await this.db
      .updateTable('notifications.alert_rules')
      .set(values)
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirst();
    return row ? toRule(row as RuleRow) : null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('notifications.alert_rules')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return (result.numDeletedRows ?? 0n) > 0n;
  }
}

function toRule(row: RuleRow): AlertRule {
  return {
    id: row.id,
    user_id: row.user_id,
    kind: row.kind,
    instrument_id: row.instrument_id,
    listing_id: row.listing_id,
    params: (row.params ?? {}) as Record<string, unknown>,
    label: row.label,
    enabled: row.enabled,
    notify_once: row.notify_once,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
