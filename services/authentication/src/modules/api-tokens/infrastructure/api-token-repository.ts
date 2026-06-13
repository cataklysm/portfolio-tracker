import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { AuthDatabase } from '../../../platform/database/schema.js';
import type {
  ApiTokenForExchange,
  ApiTokenRecord,
  ApiTokenRepository,
  CreateApiTokenInput,
} from '../application/ports.js';

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** Kysely adapter for `authentication.personal_access_tokens`. */
export class KyselyApiTokenRepository implements ApiTokenRepository {
  constructor(private readonly db: Kysely<AuthDatabase>) {}

  async create(input: CreateApiTokenInput): Promise<ApiTokenRecord> {
    const row = await this.db
      .insertInto('authentication.personal_access_tokens')
      .values({
        user_id: input.userId,
        name: input.name,
        token_hash: input.tokenHash,
        scopes: input.scopes,
        expires_at: input.expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRecord(row);
  }

  async listByUser(userId: string): Promise<ApiTokenRecord[]> {
    const rows = await this.db
      .selectFrom('authentication.personal_access_tokens')
      .selectAll()
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRecord);
  }

  async revoke(userId: string, id: string): Promise<boolean> {
    const result = await this.db
      .updateTable('authentication.personal_access_tokens')
      .set({ revoked_at: new Date() })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  async findByHash(tokenHash: string): Promise<ApiTokenForExchange | null> {
    const row = await this.db
      .selectFrom('authentication.personal_access_tokens')
      .select(['id', 'user_id', 'scopes', 'expires_at', 'revoked_at'])
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      scopes: row.scopes,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.db
      .updateTable('authentication.personal_access_tokens')
      .set({ last_used_at: sql`now()` })
      .where('id', '=', id)
      .execute();
  }
}

interface Row {
  id: string;
  name: string;
  scopes: string[];
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date | null;
}

function toRecord(row: Row): ApiTokenRecord {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    created_at: row.created_at.toISOString(),
    last_used_at: iso(row.last_used_at),
    expires_at: iso(row.expires_at),
  };
}
