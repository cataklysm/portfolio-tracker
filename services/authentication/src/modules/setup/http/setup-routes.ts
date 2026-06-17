import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Kysely } from 'kysely';
import { AppError } from '@portfolio/platform';
import type { AuthDatabase } from '../../../platform/database/schema.js';
import type { PasswordHasher } from '../../../platform/security/password-hasher.js';
import { BootstrapValidationError, runBootstrap } from '../application/run-bootstrap.js';

const SetupSuccessResponse = Type.Object({
  status: Type.Literal('initialized'),
  adminUserId: Type.String(),
});

const SetupBody = Type.Object({
  auth: Type.Object({ local: Type.Boolean(), oidc: Type.Boolean() }),
  oidc: Type.Optional(Type.Object({ issuerUrl: Type.String(), clientId: Type.String() })),
  admin: Type.Object({
    email: Type.String(),
    displayName: Type.Optional(Type.String()),
    password: Type.Optional(Type.String()),
  }),
});

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface SetupRouteDeps {
  db: Kysely<AuthDatabase>;
  hasher: PasswordHasher;
  setupSecret: string | undefined;
}

/**
 * First-start HTTP setup. Disabled (fail-closed) unless AUTH_SETUP_SECRET is
 * configured, and permanently a no-op once the instance is initialized. The
 * CLI bootstrap path remains available regardless.
 */
export function registerSetupRoutes(app: FastifyInstance, deps: SetupRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();

  r.post('/auth/setup', { schema: { body: SetupBody, response: { 201: SetupSuccessResponse } } }, async (request, reply) => {
    if (!deps.setupSecret) {
      throw new AppError({
        status: 501,
        code: 'setup_disabled',
        title: 'Not Implemented',
        detail: 'Setup endpoint is disabled (AUTH_SETUP_SECRET not configured)',
      });
    }
    const provided = (request.headers['x-setup-secret'] as string | undefined) ?? '';
    if (!secretMatches(provided, deps.setupSecret)) {
      throw AppError.unauthorized('invalid_setup_secret', 'Invalid or missing setup secret');
    }

    try {
      const result = await runBootstrap(deps.db, deps.hasher, request.body);
      if (result.status === 'already-initialized') {
        throw AppError.conflict('already_initialized', 'Instance already initialized');
      }
      reply.code(201);
      return result;
    } catch (err) {
      if (err instanceof BootstrapValidationError) {
        throw AppError.badRequest('invalid_bootstrap_input', err.message);
      }
      throw err;
    }
  });
}
