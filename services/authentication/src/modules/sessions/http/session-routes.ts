import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { SessionService } from '../application/session-service.js';

const TokenPairResponse = Type.Object({
  access_token: Type.String(),
  refresh_token: Type.String(),
  token_type: Type.Literal('Bearer'),
  expires_in: Type.Integer(),
});

const LoginBody = Type.Object({
  email: Type.String({ minLength: 3, maxLength: 320 }),
  password: Type.String({ minLength: 1, maxLength: 1024 }),
});

const RefreshBody = Type.Object({ refresh_token: Type.String({ minLength: 1 }) });
const LogoutBody = Type.Object({ refresh_token: Type.Optional(Type.String()) });

/**
 * Public authentication endpoints: local login, refresh-token rotation, and
 * logout. All are gateway-exposed and unauthenticated (they establish the
 * session rather than consume one).
 */
export function registerSessionRoutes(app: FastifyInstance, service: SessionService): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();

  r.post(
    '/auth/login',
    { schema: { body: LoginBody, response: { 200: TokenPairResponse } } },
    async (request) => service.login(request.body.email, request.body.password),
  );

  r.post(
    '/auth/refresh',
    { schema: { body: RefreshBody, response: { 200: TokenPairResponse } } },
    async (request) => service.refresh(request.body.refresh_token),
  );

  r.post(
    '/auth/logout',
    { schema: { body: LogoutBody } },
    async (request) => {
      if (request.body.refresh_token) await service.logout(request.body.refresh_token);
      return { ok: true };
    },
  );
}
