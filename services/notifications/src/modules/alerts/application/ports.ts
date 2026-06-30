export type NotificationType =
  | 'daily_move'
  | 'earnings_upcoming'
  | 'target_zone'
  | 'price_threshold'
  | 'cost_basis_move';
export type Severity = 'info' | 'warning' | 'critical';

export type RuleKind = 'price_threshold' | 'daily_move' | 'earnings_lead' | 'cost_basis_move' | 'target_zone';

export interface NewNotification {
  userId: string;
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string | null;
  instrumentId: string | null;
  listingId: string | null;
  ruleId: string | null;
  data: Record<string, unknown>;
}

/** A stored notification as served to the owner. */
export interface StoredNotification {
  id: string;
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string | null;
  instrument_id: string | null;
  listing_id: string | null;
  rule_id: string | null;
  data: unknown;
  read_at: string | null;
  snoozed_until: string | null;
  created_at: string;
}

export interface DueSnoozedNotification {
  id: string;
  userId: string;
  type: NotificationType;
}

export interface NotificationRepository {
  insert(notification: NewNotification): Promise<string>;
  getForUser(userId: string, id: string): Promise<StoredNotification | null>;
  listForUser(userId: string, limit: number): Promise<StoredNotification[]>;
  unreadCount(userId: string): Promise<number>;
  markRead(userId: string, id: string): Promise<boolean>;
  markAllRead(userId: string): Promise<number>;
  snooze(userId: string, id: string, until: Date): Promise<boolean>;
  releaseDueSnoozed(now: Date, limit: number): Promise<DueSnoozedNotification[]>;
  deleteReadBefore(cutoff: Date): Promise<number>;
}

export interface AlertStateRepository {
  /** Last fired signature + time for (user, listing, alert_type), or null. */
  getState(userId: string, listingId: string, alertType: string): Promise<{ signature: string; firedAt: Date } | null>;
  set(userId: string, listingId: string, alertType: string, dedupeKey: string): Promise<void>;
  clear(userId: string, listingId: string, alertType: string): Promise<void>;
  /** Removes all state rows for an alert type (used when a rule is deleted). */
  clearByAlertType(userId: string, alertType: string): Promise<void>;
}

export interface NotificationEventStore {
  enqueueCreated(input: { notificationId: string; userId: string; type: NotificationType }): Promise<void>;
}

// ---- Web Push subscriptions (desktop notifications) ------------------------

export interface NewPushSubscription {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

export interface StoredPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionRepository {
  /** Idempotent upsert on (user_id, endpoint). */
  upsert(input: NewPushSubscription): Promise<void>;
  /** All push subscriptions for a user (for fan-out). */
  listForUser(userId: string): Promise<StoredPushSubscription[]>;
  /** Removes the user's subscription identified by sha256(endpoint) hex. */
  deleteByHash(userId: string, endpointHash: string): Promise<boolean>;
  /** Removes an expired endpoint regardless of owner (sender cleanup on 404/410). */
  deleteExpired(endpoint: string): Promise<void>;
  markSuccess(endpoint: string): Promise<void>;
}

// ---- User-defined alert rules ----------------------------------------------

export interface AlertRule {
  id: string;
  user_id: string;
  kind: RuleKind;
  instrument_id: string;
  listing_id: string | null;
  params: Record<string, unknown>;
  label: string | null;
  enabled: boolean;
  /** When true, the rule disables itself after firing once. */
  notify_once: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewAlertRule {
  userId: string;
  kind: RuleKind;
  instrumentId: string;
  listingId: string | null;
  params: Record<string, unknown>;
  label: string | null;
  notifyOnce: boolean;
}

export interface UpdateAlertRule {
  params?: Record<string, unknown>;
  label?: string | null;
  enabled?: boolean;
  notifyOnce?: boolean;
}

export interface AlertRuleRepository {
  create(input: NewAlertRule): Promise<AlertRule>;
  listByUser(userId: string, filter?: { instrumentId?: string; listingId?: string }): Promise<AlertRule[]>;
  listEnabled(userId: string): Promise<AlertRule[]>;
  update(userId: string, id: string, patch: UpdateAlertRule): Promise<AlertRule | null>;
  delete(userId: string, id: string): Promise<boolean>;
}
