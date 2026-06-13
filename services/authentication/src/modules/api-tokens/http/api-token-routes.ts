import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import { grantableScopes } from '../../sessions/domain/scopes.js';
import type { ApiTokenService } from '../application/api-token-service.js';

const CreateBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  scopes: Type.Optional(Type.Array(Type.String({ maxLength: 64 }), { maxItems: 32 })),
  expires_in_days: Type.Optional(Type.Integer({ minimum: 1, maximum: 3650 })),
});

export interface ApiTokenRouteDeps {
  service: ApiTokenService;
  authenticate: preHandlerHookHandler;
}

function uid(request: FastifyRequest): string {
  const sub = request.user?.sub;
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}

/**
 * Personal access token routes. Management lives under `/me` (gateway-protected)
 * and is **session-only**: a PAT-minted token (tku=api) is rejected, so a leaked
 * API credential cannot mint or revoke tokens. The exchange `/auth/token` is
 * public — the caller authenticates with the PAT itself.
 */
export function registerApiTokenRoutes(app: FastifyInstance, deps: ApiTokenRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();

  // Rejects tokens obtained via a PAT — token management requires a real session.
  const requireInteractive: preHandlerHookHandler = async (request) => {
    if (request.user?.tokenUse === 'api') {
      throw AppError.forbidden('session_required', 'Token management requires an interactive session');
    }
  };
  const session = [deps.authenticate, requireInteractive];

  r.get('/me/api-tokens', { preHandler: session }, async (request) => deps.service.list(uid(request)));

  // The scopes this user may grant to a token (for the create UI).
  r.get('/me/api-tokens/scopes', { preHandler: session }, async (request) => ({
    scopes: grantableScopes(request.user?.role === 'admin' ? 'admin' : 'user'),
  }));

  r.post('/me/api-tokens', { preHandler: session, schema: { body: CreateBody } }, async (request, reply) => {
    const role = request.user?.role === 'admin' ? 'admin' : 'user';
    const { token, record } = await deps.service.create(uid(request), role, {
      name: request.body.name,
      scopes: request.body.scopes,
      expiresInDays: request.body.expires_in_days,
    });
    reply.code(201);
    // `token` is the plaintext secret — returned exactly once, never stored.
    return { token, ...record };
  });

  r.delete('/me/api-tokens/:id', { preHandler: session }, async (request) => {
    await deps.service.revoke(uid(request), (request.params as { id: string }).id);
    return { ok: true };
  });

  // Public: exchange a PAT (Authorization: Bearer pat_…) for an access token.
  r.post('/auth/token', async (request) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw AppError.unauthorized('missing_api_token', 'Provide the API token as a Bearer credential');
    }
    return deps.service.exchange(header.slice(7));
  });
}
