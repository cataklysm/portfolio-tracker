import { AppError } from '@portfolio/platform';
import type { NotificationRepository, StoredNotification } from './ports.js';

export interface Inbox {
  unread_count: number;
  notifications: StoredNotification[];
}

/** Read/ack use cases for a user's own notifications. */
export class NotificationService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly defaultLimit = 30,
  ) {}

  async getInbox(userId: string, limit?: number): Promise<Inbox> {
    const [notifications, unread_count] = await Promise.all([
      this.repo.listForUser(userId, limit ?? this.defaultLimit),
      this.repo.unreadCount(userId),
    ]);
    return { unread_count, notifications };
  }

  async getNotification(userId: string, id: string): Promise<StoredNotification | null> {
    return this.repo.getForUser(userId, id);
  }

  async markRead(userId: string, id: string): Promise<void> {
    if (!(await this.repo.markRead(userId, id))) {
      throw AppError.notFound('notification_not_found', 'Notification not found');
    }
  }

  async snooze(userId: string, id: string, minutes: number): Promise<void> {
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
      throw AppError.badRequest('invalid_snooze_interval', 'minutes must be an integer between 5 and 1440');
    }
    const until = new Date(Date.now() + minutes * 60_000);
    if (!(await this.repo.snooze(userId, id, until))) {
      throw AppError.notFound('notification_not_found', 'Notification not found');
    }
  }

  markAllRead(userId: string): Promise<number> {
    return this.repo.markAllRead(userId);
  }

  deleteReadOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.repo.deleteReadBefore(cutoff);
  }
}
