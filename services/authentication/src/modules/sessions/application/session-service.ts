import { randomUUID } from 'node:crypto';
import { AppError } from '@portfolio/platform';
import type { TokenSigner } from '../../keys/index.js';
import type { PasswordHasher } from '../../../platform/security/password-hasher.js';
import { scopesForRole } from '../domain/scopes.js';
import { generateRefreshToken, hashRefreshToken } from '../domain/refresh-token.js';
import type { CredentialsRepository, RefreshTokenStore } from './ports.js';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface SessionServiceDeps {
  credentials: CredentialsRepository;
  refreshTokens: RefreshTokenStore;
  tokenSigner: TokenSigner;
  passwordHasher: PasswordHasher;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  maxFailedAttempts: number;
  lockoutDurationMs: number;
}

/**
 * Login, refresh, and logout for local authentication. Issues internal access
 * tokens and manages revocable, rotating refresh-token sessions.
 */
export class SessionService {
  constructor(private readonly deps: SessionServiceDeps) {}

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.deps.credentials.findActiveLocalUserByEmail(email);
    const invalid = (): never => {
      throw AppError.unauthorized('invalid_credentials', 'Invalid email or password');
    };

    if (!user || !user.passwordHash) return invalid();

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError({
        status: 429,
        code: 'account_locked',
        title: 'Too Many Requests',
        detail: 'Account temporarily locked after repeated failed attempts',
      });
    }

    const valid = await this.deps.passwordHasher.verify(user.passwordHash, password);
    if (!valid) {
      const willLock = user.failedAttempts + 1 >= this.deps.maxFailedAttempts;
      const lockedUntil = willLock ? new Date(Date.now() + this.deps.lockoutDurationMs) : null;
      await this.deps.credentials.recordFailedAttempt(user.id, lockedUntil);
      return invalid();
    }

    await this.deps.credentials.resetFailedAttempts(user.id);
    return this.issueTokens(user.id, user.role);
  }

  async refresh(presentedToken: string): Promise<TokenPair> {
    const presentedHash = hashRefreshToken(presentedToken);
    const { raw: newRaw, hash: newHash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.deps.refreshTokenTtlSeconds * 1000);

    const result = await this.deps.refreshTokens.consumeAndRotate(presentedHash, {
      hash: newHash,
      expiresAt,
    });

    if (result.status === 'reused') {
      throw AppError.unauthorized('refresh_token_reused', 'Refresh token reuse detected; session revoked');
    }
    if (result.status !== 'ok') {
      throw AppError.unauthorized('invalid_refresh_token', 'The refresh token is invalid or expired');
    }

    const role = await this.deps.credentials.findActiveUserRole(result.userId);
    if (!role) throw AppError.unauthorized('user_inactive', 'User is no longer active');

    const accessToken = await this.deps.tokenSigner.signAccessToken({
      userId: result.userId,
      role,
      scopes: scopesForRole(role),
      sessionId: result.sessionId,
    });
    return this.tokenPair(accessToken, newRaw);
  }

  async logout(presentedToken: string): Promise<void> {
    await this.deps.refreshTokens.revokeByHash(hashRefreshToken(presentedToken));
  }

  private async issueTokens(userId: string, role: 'user' | 'admin'): Promise<TokenPair> {
    const sessionId = randomUUID();
    const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.deps.refreshTokenTtlSeconds * 1000);

    await this.deps.refreshTokens.issue({ hash: refreshHash, userId, sessionId, expiresAt });

    const accessToken = await this.deps.tokenSigner.signAccessToken({
      userId,
      role,
      scopes: scopesForRole(role),
      sessionId,
    });
    return this.tokenPair(accessToken, refreshRaw);
  }

  private tokenPair(accessToken: string, refreshToken: string): TokenPair {
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: this.deps.accessTokenTtlSeconds,
    };
  }
}
