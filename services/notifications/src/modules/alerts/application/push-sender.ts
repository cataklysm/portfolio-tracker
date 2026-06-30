import webpush from 'web-push';
import type { Logger } from '@portfolio/platform';
import type { PushSubscriptionRepository, StoredNotification, StoredPushSubscription } from './ports.js';

export interface PushSenderDeps {
  repo: PushSubscriptionRepository;
  logger: Logger;
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Sends fired notifications to a user's Web Push endpoints (desktop
 * notifications). Constructed only when VAPID keys are configured. Expired
 * subscriptions (404/410 from the push service) are pruned on the fly.
 */
export class PushSender {
  constructor(private readonly deps: PushSenderDeps) {
    webpush.setVapidDetails(deps.subject, deps.publicKey, deps.privateKey);
  }

  async sendToUser(userId: string, notification: StoredNotification): Promise<void> {
    const subs = await this.deps.repo.listForUser(userId);
    if (subs.length === 0) return;
    const pushPayload = buildPushPayload(notification);
    const payload = JSON.stringify({
      id: notification.id,
      title: pushPayload.title,
      body: pushPayload.body,
      severity: notification.severity,
      type: notification.type,
      instrument_id: notification.instrument_id,
      listing_id: notification.listing_id,
      timestamp: notification.created_at,
      icon: '/notification-icon.svg',
      badge: '/notification-badge.svg',
      url: pushPayload.url,
    });
    await Promise.all(subs.map((sub) => this.sendOne(sub, payload)));
  }

  private async sendOne(sub: StoredPushSubscription, payload: string): Promise<void> {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      await this.deps.repo.markSuccess(sub.endpoint).catch(() => undefined);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404 Not Found / 410 Gone → the subscription is dead; drop it.
      if (status === 404 || status === 410) {
        await this.deps.repo.deleteExpired(sub.endpoint).catch(() => undefined);
        return;
      }
      this.deps.logger.warn({ err, status, error_code: 'push_send_failed' }, 'Web push send failed');
    }
  }
}

function buildPushPayload(notification: StoredNotification): { title: string; body: string; url: string } {
  return {
    title: notification.title,
    body: notification.body ?? fallbackBody(notification),
    url: '/notifications',
  };
}

function fallbackBody(notification: StoredNotification): string {
  const data = notification.data as Record<string, unknown>;
  switch (notification.type) {
    case 'price_threshold':
      return compactParts([
        formatSignedValue(data['price'], 'Current'),
        `${String(data['direction'] ?? 'threshold')} ${formatValue(data['threshold'])}`,
      ]).join(' · ');
    case 'daily_move':
      return compactParts([
        formatPct(data['daily_change_pct'], 'Move'),
        formatSignedValue(data['latest'], 'Price'),
      ]).join(' · ');
    case 'cost_basis_move':
      return compactParts([
        formatPct(data['unrealized_pct'], 'From cost'),
        formatSignedValue(data['price'], 'Price'),
      ]).join(' · ');
    case 'target_zone':
      return compactParts([formatSignedValue(data['price'], 'Price'), 'Target zone reached']).join(' · ');
    case 'earnings_upcoming':
      return compactParts([String(data['report_date'] ?? ''), formatDays(data['days_until'])]).join(' · ');
    default:
      return 'Portfolio alert';
  }
}

function compactParts(parts: string[]): string[] {
  return parts.filter((part) => part.trim().length > 0);
}

function formatSignedValue(value: unknown, label: string): string {
  const formatted = formatValue(value);
  return formatted ? `${label} ${formatted}` : '';
}

function formatValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return '';
}

function formatPct(value: unknown, label: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return `${label} ${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatDays(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  if (value === 0) return 'Today';
  return `In ${value} day${value === 1 ? '' : 's'}`;
}
