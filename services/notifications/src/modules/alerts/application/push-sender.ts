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
    const payload = JSON.stringify({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      severity: notification.severity,
      type: notification.type,
      instrument_id: notification.instrument_id,
      listing_id: notification.listing_id,
      url: '/notifications',
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
