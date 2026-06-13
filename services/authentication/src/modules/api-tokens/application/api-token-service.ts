import { AppError } from '@portfolio/platform';
import type { TokenSigner } from '../../keys/index.js';
import { grantableScopes } from '../../sessions/domain/scopes.js';
import { generateApiToken, hashApiToken } from '../domain/api-token.js';
import type { ApiTokenRecord, ApiTokenRepository, UserRoleReader } from './ports.js';

export interface CreateApiTokenRequest {
  name: string;
  /** Requested scopes; intersected with what the role may grant. Empty ⇒ all grantable. */
  scopes?: string[];
  /** Optional lifetime in days; omitted ⇒ never expires (revoke to invalidate). */
  expiresInDays?: number;
}

export interface AccessTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface ApiTokenServiceDeps {
  repo: ApiTokenRepository;
  roles: UserRoleReader;
  tokenSigner: TokenSigner;
  accessTokenTtlSeconds: number;
}

/**
 * Manages personal access tokens and the PAT→access-token exchange. A PAT can
 * only ever carry a subset of the owner's grantable scopes, and the exchange
 * re-derives that subset from the user's current role, so revoking a role
 * capability immediately narrows every token that depended on it.
 */
export class ApiTokenService {
  constructor(private readonly deps: ApiTokenServiceDeps) {}

  async create(
    userId: string,
    role: 'user' | 'admin',
    input: CreateApiTokenRequest,
  ): Promise<{ token: string; record: ApiTokenRecord }> {
    const grantable = grantableScopes(role);
    const requested = input.scopes && input.scopes.length > 0 ? input.scopes : grantable;
    const scopes = requested.filter((scope) => grantable.includes(scope));
    if (scopes.length === 0) {
      throw AppError.badRequest('no_grantable_scopes', 'None of the requested scopes can be granted');
    }

    const expiresAt =
      input.expiresInDays && input.expiresInDays > 0
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    const { raw, hash } = generateApiToken();
    const record = await this.deps.repo.create({ userId, name: input.name, tokenHash: hash, scopes, expiresAt });
    return { token: raw, record };
  }

  list(userId: string): Promise<ApiTokenRecord[]> {
    return this.deps.repo.listByUser(userId);
  }

  async revoke(userId: string, id: string): Promise<void> {
    const ok = await this.deps.repo.revoke(userId, id);
    if (!ok) throw AppError.notFound('api_token_not_found', 'No such API token');
  }

  /** Exchanges a presented PAT secret for a short-lived access token. */
  async exchange(presentedToken: string): Promise<AccessTokenResponse> {
    const invalid = (): never => {
      throw AppError.unauthorized('invalid_api_token', 'The API token is invalid, expired, or revoked');
    };

    const pat = await this.deps.repo.findByHash(hashApiToken(presentedToken));
    if (!pat || pat.revokedAt || (pat.expiresAt && pat.expiresAt <= new Date())) return invalid();

    const role = await this.deps.roles.findActiveUserRole(pat.userId);
    if (!role) return invalid();

    // Re-intersect with currently-grantable scopes (role may have changed).
    const grantable = grantableScopes(role);
    const scopes = pat.scopes.filter((scope) => grantable.includes(scope));

    const accessToken = await this.deps.tokenSigner.signAccessToken({
      userId: pat.userId,
      role,
      scopes,
      sessionId: `pat:${pat.id}`,
      tokenUse: 'api',
    });
    await this.deps.repo.touchLastUsed(pat.id);

    return { access_token: accessToken, token_type: 'Bearer', expires_in: this.deps.accessTokenTtlSeconds };
  }
}
