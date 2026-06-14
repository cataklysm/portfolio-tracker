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

  async markRead(userId: string, id: string): Promise<void> {
    if (!(await this.repo.markRead(userId, id))) {
      throw AppError.notFound('notification_not_found', 'Notification not found');
    }
  }

  markAllRead(userId: string): Promise<number> {
    return this.repo.markAllRead(userId);
  }
}
