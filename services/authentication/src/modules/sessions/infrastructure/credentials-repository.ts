import { sql, type Kysely } from 'kysely';
import type { AuthDatabase } from '../../../platform/database/schema.js';
import type { CredentialsRepository, LocalUserRecord } from '../application/ports.js';

/**
 * Reads local-auth credentials and maintains the failed-attempt / lockout
 * counters. Only local accounts (no external OIDC subject) authenticate here.
 */
export class KyselyCredentialsRepository implements CredentialsRepository {
  constructor(private readonly db: Kysely<AuthDatabase>) {}

  async findActiveLocalUserByEmail(email: string): Promise<LocalUserRecord | null> {
    const row = await this.db
      .selectFrom('authentication.users as u')
      .leftJoin('authentication.local_credentials as lc', 'lc.user_id', 'u.id')
      .select([
        'u.id as id',
        'u.email as email',
        'u.role as role',
        'lc.password_hash as password_hash',
        'lc.failed_attempts as failed_attempts',
        'lc.locked_until as locked_until',
      ])
      .where((eb) => eb(sql<string>`lower(u.email)`, '=', email.toLowerCase()))
      .where('u.active', '=', true)
      .where('u.external_subject', 'is', null)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      passwordHash: row.password_hash ?? null,
      failedAttempts: row.failed_attempts ?? 0,
      lockedUntil: row.locked_until ?? null,
    };
  }

  async recordFailedAttempt(userId: string, lockedUntil: Date | null): Promise<void> {
    await this.db
      .updateTable('authentication.local_credentials')
      .set({
        failed_attempts: sql<number>`failed_attempts + 1`,
        locked_until: lockedUntil,
      })
      .where('user_id', '=', userId)
      .execute();
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    await this.db
      .updateTable('authentication.local_credentials')
      .set({ failed_attempts: 0, locked_until: null })
      .where('user_id', '=', userId)
      .execute();
  }

  async findActiveUserRole(userId: string): Promise<'user' | 'admin' | null> {
    const row = await this.db
      .selectFrom('authentication.users')
      .select('role')
      .where('id', '=', userId)
      .where('active', '=', true)
      .executeTakeFirst();
    return row?.role ?? null;
  }
}
