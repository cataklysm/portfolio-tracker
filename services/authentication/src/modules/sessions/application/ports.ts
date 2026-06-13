/**
 * Ports the session use cases depend on. Kysely adapters in `infrastructure/`
 * implement these; the use cases stay free of SQL.
 */

export interface LocalUserRecord {
  id: string;
  email: string;
  role: 'user' | 'admin';
  passwordHash: string | null;
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface CredentialsRepository {
  findActiveLocalUserByEmail(email: string): Promise<LocalUserRecord | null>;
  /** Atomically increment the failed-attempt counter and optionally lock. */
  recordFailedAttempt(userId: string, lockedUntil: Date | null): Promise<void>;
  resetFailedAttempts(userId: string): Promise<void>;
  findActiveUserRole(userId: string): Promise<'user' | 'admin' | null>;
}

export interface NewRefreshToken {
  hash: string;
  expiresAt: Date;
}

export type RotationResult =
  | { status: 'ok'; userId: string; sessionId: string }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'reused' };

export interface RefreshTokenStore {
  /** Persists a freshly issued refresh token at login. */
  issue(input: { hash: string; userId: string; sessionId: string; expiresAt: Date }): Promise<void>;
  /**
   * Atomically validates and rotates the presented token. Reuse of an already
   * revoked token revokes the entire affected session and returns `reused`.
   */
  consumeAndRotate(presentedHash: string, replacement: NewRefreshToken): Promise<RotationResult>;
  /** Logout: revoke the single presented token if still active. */
  revokeByHash(hash: string): Promise<void>;
}
