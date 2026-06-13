/** PAT metadata returned to the owner; the secret is never included. */
export interface ApiTokenRecord {
  id: string;
  name: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export interface CreateApiTokenInput {
  userId: string;
  name: string;
  tokenHash: string;
  scopes: string[];
  expiresAt: Date | null;
}

/** The minimal PAT shape the exchange needs to validate and mint a token. */
export interface ApiTokenForExchange {
  id: string;
  userId: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface ApiTokenRepository {
  create(input: CreateApiTokenInput): Promise<ApiTokenRecord>;
  listByUser(userId: string): Promise<ApiTokenRecord[]>;
  /** Revokes the user's own token; false if no matching active token exists. */
  revoke(userId: string, id: string): Promise<boolean>;
  findByHash(tokenHash: string): Promise<ApiTokenForExchange | null>;
  touchLastUsed(id: string): Promise<void>;
}

/** Reads a user's current role (to re-derive grantable scopes at exchange). */
export interface UserRoleReader {
  findActiveUserRole(userId: string): Promise<'user' | 'admin' | null>;
}
