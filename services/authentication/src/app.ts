import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import {
  createDatabase,
  createLogger,
  createService,
  UserTokenVerifier,
} from '@portfolio/platform';
import type { AuthConfig } from './config/config.js';
import type { AuthDatabase } from './platform/database/schema.js';
import { PasswordHasher } from './platform/security/password-hasher.js';
import { TokenSigner, registerJwksRoutes } from './modules/keys/index.js';
import {
  SessionService,
  KyselyCredentialsRepository,
  KyselyRefreshTokenStore,
  registerSessionRoutes,
} from './modules/sessions/index.js';
import {
  ApiTokenService,
  KyselyApiTokenRepository,
  registerApiTokenRoutes,
} from './modules/api-tokens/index.js';
import { registerSetupRoutes } from './modules/setup/index.js';
import {
  ProfileService,
  KyselyProfileRepository,
  registerProfileRoutes,
} from './modules/profile/index.js';
import {
  TaxResidencyService,
  KyselyTaxResidencyRepository,
  registerTaxResidencyRoutes,
} from './modules/tax-residency/index.js';

export interface BuiltService {
  app: FastifyInstance;
  shutdown: () => Promise<void>;
}

/**
 * Composition root: constructs adapters, wires them to use cases, and registers
 * each feature's routes. No business logic lives here.
 */
export async function buildApp(config: AuthConfig): Promise<BuiltService> {
  const logger = createLogger({
    service: 'authentication',
    serviceVersion: config.serviceVersion,
    environment: config.environment,
    pretty: config.environment === 'development',
  });

  const { db, pool } = createDatabase<AuthDatabase>({
    connectionString: config.databaseUrl,
    logger,
  });

  const hasher = new PasswordHasher();
  const tokenSigner = await TokenSigner.create({
    privateKeyPem: config.jwt.privateKeyPem,
    keyId: config.jwt.keyId,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    accessTokenTtlSeconds: config.jwt.accessTokenTtlSeconds,
  });

  const credentials = new KyselyCredentialsRepository(db);
  const sessionService = new SessionService({
    credentials,
    refreshTokens: new KyselyRefreshTokenStore(db),
    tokenSigner,
    passwordHasher: hasher,
    accessTokenTtlSeconds: config.jwt.accessTokenTtlSeconds,
    refreshTokenTtlSeconds: config.jwt.refreshTokenTtlSeconds,
    maxFailedAttempts: config.lockout.maxFailedAttempts,
    lockoutDurationMs: config.lockout.durationMs,
  });

  const profileService = new ProfileService(new KyselyProfileRepository(db));
  const taxResidencyService = new TaxResidencyService(new KyselyTaxResidencyRepository(db));

  const apiTokenService = new ApiTokenService({
    repo: new KyselyApiTokenRepository(db),
    roles: credentials,
    tokenSigner,
    accessTokenTtlSeconds: config.jwt.accessTokenTtlSeconds,
  });

  // The auth service validates its own tokens (for /me) against its JWKS.
  const verifier = new UserTokenVerifier({
    jwksUri: `${config.jwt.issuer}/.well-known/jwks.json`,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });

  const app = await createService({
    name: 'authentication',
    logger,
    health: {
      ready: async () => {
        await sql`SELECT 1`.execute(db);
      },
    },
  });

  registerJwksRoutes(app, tokenSigner);
  registerSetupRoutes(app, { db, hasher, setupSecret: config.setupSecret });
  registerSessionRoutes(app, sessionService);
  registerApiTokenRoutes(app, { service: apiTokenService, authenticate: verifier.authenticate });
  registerProfileRoutes(app, {
    service: profileService,
    authenticate: verifier.authenticate,
    requireScope: (scope) => verifier.requireScope(scope),
  });
  registerTaxResidencyRoutes(app, {
    service: taxResidencyService,
    authenticate: verifier.authenticate,
    requireScope: (scope) => verifier.requireScope(scope),
  });

  return {
    app,
    shutdown: async () => {
      await app.close();
      await pool.end();
    },
  };
}
