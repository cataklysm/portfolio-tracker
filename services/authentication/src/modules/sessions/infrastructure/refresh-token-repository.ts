import type { Kysely } from 'kysely';
import type { AuthDatabase } from '../../../platform/database/schema.js';
import type {
  NewRefreshToken,
  RefreshTokenStore,
  RotationResult,
} from '../application/ports.js';

/**
 * Persists refresh tokens and performs rotation with reuse detection. Tokens
 * rotate on every use; presenting an already revoked token is treated as theft
 * and revokes the whole session.
 */
export class KyselyRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly db: Kysely<AuthDatabase>) {}

  async issue(input: {
    hash: string;
    userId: string;
    sessionId: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.db
      .insertInto('authentication.refresh_tokens')
      .values({
        token_hash: input.hash,
        user_id: input.userId,
        session_id: input.sessionId,
        expires_at: input.expiresAt,
      })
      .execute();
  }

  async consumeAndRotate(
    presentedHash: string,
    replacement: NewRefreshToken,
  ): Promise<RotationResult> {
    return this.db.transaction().execute(async (trx) => {
      // Lock the presented token row so concurrent refreshes serialize.
      const current = await trx
        .selectFrom('authentication.refresh_tokens')
        .select(['id', 'user_id', 'session_id', 'expires_at', 'revoked_at'])
        .where('token_hash', '=', presentedHash)
        .forUpdate()
        .executeTakeFirst();

      if (!current) return { status: 'invalid' } as const;

      if (current.revoked_at) {
        // Reuse of a revoked token: revoke every token in the session.
        await trx
          .updateTable('authentication.refresh_tokens')
          .set({ revoked_at: new Date() })
          .where('session_id', '=', current.session_id)
          .where('revoked_at', 'is', null)
          .execute();
        return { status: 'reused' } as const;
      }

      if (current.expires_at < new Date()) return { status: 'expired' } as const;

      const inserted = await trx
        .insertInto('authentication.refresh_tokens')
        .values({
          token_hash: replacement.hash,
          user_id: current.user_id,
          session_id: current.session_id,
          expires_at: replacement.expiresAt,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      // Guarded revoke: only one rotation can win the race.
      const revoke = await trx
        .updateTable('authentication.refresh_tokens')
        .set({ revoked_at: new Date(), replaced_by_token_id: inserted.id })
        .where('id', '=', current.id)
        .where('revoked_at', 'is', null)
        .executeTakeFirst();

      if (Number(revoke.numUpdatedRows) === 0) return { status: 'reused' } as const;

      return {
        status: 'ok',
        userId: current.user_id,
        sessionId: current.session_id,
      } as const;
    });
  }

  async revokeByHash(hash: string): Promise<void> {
    await this.db
      .updateTable('authentication.refresh_tokens')
      .set({ revoked_at: new Date() })
      .where('token_hash', '=', hash)
      .where('revoked_at', 'is', null)
      .execute();
  }
}
