import type { ColumnType, Generated } from 'kysely';

/**
 * Kysely schema for the notifications service. Owns `notifications.*`: the
 * user-visible notifications, the per-user interest projection built from
 * portfolio events, the alert-dedup state, and the outbox.
 */

type Json = ColumnType<unknown, string | undefined, string>;

export type NotificationType =
  | 'daily_move'
  | 'earnings_upcoming'
  | 'target_zone'
  | 'price_threshold'
  | 'cost_basis_move';

export type RuleKind = 'price_threshold' | 'daily_move' | 'earnings_lead' | 'cost_basis_move' | 'target_zone';

export interface NotificationsTable {
  id: Generated<string>;
  user_id: string;
  type: NotificationType;
  severity: ColumnType<'info' | 'warning' | 'critical', 'info' | 'warning' | 'critical' | undefined, 'info' | 'warning' | 'critical'>;
  title: string;
  body: string | null;
  instrument_id: string | null;
  listing_id: string | null;
  rule_id: string | null;
  data: Json | null;
  read_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  snoozed_until: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: Generated<Date>;
}

export interface UserInterestsTable {
  interest_id: string;
  user_id: string;
  listing_id: string;
  interest_type: 'position' | 'watchlist';
  active: boolean;
  aggregate_version: ColumnType<string, string | number, string | number>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface AlertStateTable {
  user_id: string;
  listing_id: string;
  alert_type: string;
  dedupe_key: string;
  fired_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface OutboxEventsTable {
  id: Generated<string>;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: ColumnType<string, string | number, string | number>;
  payload: Json;
  correlation_id: string | null;
  causation_id: string | null;
  occurred_at: Generated<Date>;
  published_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  attempts: Generated<number>;
  last_error: string | null;
}

export interface AlertRulesTable {
  id: Generated<string>;
  user_id: string;
  kind: RuleKind;
  instrument_id: string;
  listing_id: string | null;
  params: Json;
  label: string | null;
  enabled: ColumnType<boolean, boolean | undefined, boolean>;
  notify_once: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: Generated<Date>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface PushSubscriptionsTable {
  id: Generated<string>;
  user_id: string;
  endpoint: string;
  /** sha256(endpoint) hex — the deterministic public handle used for deletes. */
  endpoint_hash: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: Generated<Date>;
  last_success_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface NotificationsDatabase {
  'notifications.notifications': NotificationsTable;
  'notifications.user_interests': UserInterestsTable;
  'notifications.alert_state': AlertStateTable;
  'notifications.alert_rules': AlertRulesTable;
  'notifications.push_subscriptions': PushSubscriptionsTable;
  'notifications.outbox_events': OutboxEventsTable;
}
