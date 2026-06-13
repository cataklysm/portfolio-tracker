import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { AppError } from '../problem-details.js';

/**
 * The authenticated principal carried on every user-scoped request. Downstream
 * services treat the authentication service as the single token authority and
 * never re-derive identity from the login method.
 */
export interface AuthenticatedUser {
  sub: string;
  role: 'user' | 'admin';
  scopes: string[];
  sessionId?: string;
  /** 'api' when the token was minted from a personal access token. */
  tokenUse?: string;
}

export interface UserTokenVerifierOptions {
  jwksUri: string;
  issuer: string;
  audience: string;
}

interface AccessTokenClaims extends JWTPayload {
  role?: string;
  scopes?: string | string[];
  sid?: string;
  tku?: string;
}

function parseScopes(scopes: string | string[] | undefined): string[] {
  if (Array.isArray(scopes)) return scopes;
  if (typeof scopes === 'string') return scopes.split(' ').filter(Boolean);
  return [];
}

/**
 * Verifies internal access tokens against the authentication service's JWKS and
 * exposes Fastify hooks: `authenticate` to require a valid token, and
 * `requireScope` to enforce a specific capability scope.
 */
export class UserTokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly options: UserTokenVerifierOptions) {
    this.jwks = createRemoteJWKSet(new URL(options.jwksUri));
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    const { payload } = await jwtVerify<AccessTokenClaims>(token, this.jwks, {
      issuer: this.options.issuer,
      audience: this.options.audience,
    });
    if (!payload.sub) throw AppError.unauthorized('invalid_token', 'Token missing subject');
    const role = payload.role === 'admin' ? 'admin' : 'user';
    return {
      sub: payload.sub,
      role,
      scopes: parseScopes(payload.scopes),
      sessionId: payload.sid,
      tokenUse: payload.tku,
    };
  }

  /** preHandler that requires a valid bearer token and attaches `request.user`. */
  authenticate: preHandlerHookHandler = async (request: FastifyRequest, _reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw AppError.unauthorized('missing_bearer_token', 'A bearer token is required');
    }
    try {
      request.user = await this.verify(header.slice(7));
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.unauthorized('invalid_token', 'The access token is invalid or expired');
    }
  };

  /** preHandler factory that enforces a capability scope after authentication. */
  requireScope(scope: string): preHandlerHookHandler {
    return async (request: FastifyRequest) => {
      const user = request.user;
      if (!user) throw AppError.unauthorized('missing_bearer_token', 'A bearer token is required');
      if (!user.scopes.includes(scope)) {
        throw AppError.forbidden('missing_scope', `This operation requires the "${scope}" scope`);
      }
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
