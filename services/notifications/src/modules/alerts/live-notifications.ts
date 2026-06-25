import type { Logger } from '@portfolio/platform';
import type { EventEnvelope, RedisClientType } from '@portfolio/platform';
import type { NotificationService } from './application/notification-service.js';
import type { PushSender } from './application/push-sender.js';
import type { StoredNotification } from './application/ports.js';

type NotificationSink = (notification: StoredNotification) => void;

interface NotificationCreatedPayload {
  notification_id?: string;
  user_id?: string;
  type?: string;
}

export class LiveNotificationHub {
  private readonly clients = new Map<string, Set<NotificationSink>>();

  subscribe(userId: string, sink: NotificationSink): () => void {
    const clients = this.clients.get(userId) ?? new Set<NotificationSink>();
    clients.add(sink);
    this.clients.set(userId, clients);
    return () => {
      clients.delete(sink);
      if (clients.size === 0) this.clients.delete(userId);
    };
  }

  hasSubscribers(userId: string): boolean {
    return (this.clients.get(userId)?.size ?? 0) > 0;
  }

  publish(userId: string, notification: StoredNotification): void {
    const clients = this.clients.get(userId);
    if (!clients) return;
    for (const sink of clients) sink(notification);
  }
}

export class LiveNotificationStream {
  private readonly client: RedisClientType;
  private stopped = false;
  private lastId = '$';

  constructor(
    private readonly options: {
      redis: RedisClientType;
      hub: LiveNotificationHub;
      service: NotificationService;
      logger: Logger;
      /** When set, fired notifications are also delivered via Web Push. */
      pushSender?: PushSender;
      stream?: string;
      blockMs?: number;
      count?: number;
    },
  ) {
    this.client = options.redis.duplicate();
    this.client.on('error', (err) => {
      options.logger.error({ err, error_code: 'notification_live_redis_error' }, 'Live notification Redis error');
    });
  }

  async start(): Promise<void> {
    if (!this.client.isOpen) await this.client.connect();
    void this.loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.client.isOpen) await this.client.quit();
  }

  private async loop(): Promise<void> {
    const stream = this.options.stream ?? 'notifications';
    const blockMs = this.options.blockMs ?? 5000;
    const count = this.options.count ?? 50;
    while (!this.stopped) {
      try {
        const response = await this.client.xRead([{ key: stream, id: this.lastId }], { COUNT: count, BLOCK: blockMs });
        if (!response) continue;
        for (const streamResult of response) {
          for (const entry of streamResult.messages) {
            this.lastId = entry.id;
            await this.process(entry.message);
          }
        }
      } catch (err) {
        if (this.stopped) break;
        this.options.logger.error({ err, error_code: 'notification_live_stream_read_failed' }, 'Live notification stream read failed');
        await delay(1000);
      }
    }
  }

  private async process(fields: Record<string, string>): Promise<void> {
    const raw = fields['event'];
    if (!raw) return;
    const envelope = JSON.parse(raw) as EventEnvelope<NotificationCreatedPayload>;
    if (envelope.event_type !== 'notifications.created') return;
    const userId = envelope.payload.user_id;
    const notificationId = envelope.payload.notification_id;
    if (!userId || !notificationId) return;
    const hasLiveClients = this.options.hub.hasSubscribers(userId);
    const pushSender = this.options.pushSender;
    // Nothing to deliver to: no open tab and no push configured.
    if (!hasLiveClients && !pushSender) return;
    const notification = await this.options.service.getNotification(userId, notificationId);
    if (!notification || notification.read_at) return;
    if (hasLiveClients) this.options.hub.publish(userId, notification);
    // Desktop push goes out regardless of an open tab; best-effort.
    if (pushSender) {
      await pushSender.sendToUser(userId, notification).catch((err: unknown) => {
        this.options.logger.warn({ err, error_code: 'push_fanout_failed' }, 'Web push fan-out failed');
      });
    }
  }
}

export class NotificationRetentionScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly service: NotificationService,
    private readonly retentionDays: number,
    private readonly intervalMs: number,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (this.timer || this.retentionDays <= 0) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const deleted = await this.service.deleteReadOlderThan(this.retentionDays);
      if (deleted > 0) this.logger.info({ deleted, retention_days: this.retentionDays }, 'Deleted old read notifications');
    } catch (err) {
      this.logger.error({ err, error_code: 'notification_retention_failed' }, 'Notification retention cleanup failed');
    } finally {
      this.running = false;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
