import { sql, type Kysely } from 'kysely';
import type { AuthDatabase } from '../../../platform/database/schema.js';
import type { PasswordHasher } from '../../../platform/security/password-hasher.js';

// Fixed 64-bit constant used as the advisory-lock key that serializes
// concurrent first-start attempts.
const BOOTSTRAP_LOCK_KEY = 815_472_001;

export interface BootstrapInput {
  auth: { local: boolean; oidc: boolean };
  oidc?: { issuerUrl: string; clientId: string };
  admin: { email: string; displayName?: string; password?: string };
}

export type BootstrapResult =
  | { status: 'initialized'; adminUserId: string }
  | { status: 'already-initialized' };

export class BootstrapValidationError extends Error {}

export function validateBootstrapInput(input: BootstrapInput): void {
  if (!input.auth.local && !input.auth.oidc) {
    throw new BootstrapValidationError('At least one auth method (local or oidc) must be enabled.');
  }
  if (input.auth.local && !input.admin.password) {
    throw new BootstrapValidationError('An admin password is required when local auth is enabled.');
  }
  if (input.auth.local && (input.admin.password?.length ?? 0) < 12) {
    throw new BootstrapValidationError('The admin password must be at least 12 characters long.');
  }
  if (input.auth.oidc && (!input.oidc?.issuerUrl || !input.oidc?.clientId)) {
    throw new BootstrapValidationError('issuerUrl and clientId are required when OIDC auth is enabled.');
  }
  if (!input.admin.email || !input.admin.email.includes('@')) {
    throw new BootstrapValidationError('A valid admin email is required.');
  }
}

/**
 * First-start setup: initializes instance_config, creates the initial admin,
 * and (for local auth) stores an argon2id password hash. Idempotent,
 * transactional, and race-safe via an advisory lock.
 */
export async function runBootstrap(
  db: Kysely<AuthDatabase>,
  hasher: PasswordHasher,
  input: BootstrapInput,
): Promise<BootstrapResult> {
  validateBootstrapInput(input);

  // Hash outside the transaction (CPU-intensive).
  const passwordHash =
    input.auth.local && input.admin.password ? await hasher.hash(input.admin.password) : null;

  return db.transaction().execute(async (trx) => {
    await sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`.execute(trx);

    const existing = await trx
      .selectFrom('authentication.instance_config')
      .select('singleton')
      .executeTakeFirst();
    if (existing) return { status: 'already-initialized' } as const;

    await trx
      .insertInto('authentication.instance_config')
      .values({
        allow_local_auth: input.auth.local,
        allow_oidc_auth: input.auth.oidc,
        oidc_issuer_url: input.oidc?.issuerUrl ?? null,
        oidc_client_id: input.oidc?.clientId ?? null,
      })
      .execute();

    const admin = await trx
      .insertInto('authentication.users')
      .values({
        email: input.admin.email,
        display_name: input.admin.displayName ?? null,
        role: 'admin',
        active: true,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    if (passwordHash) {
      await trx
        .insertInto('authentication.local_credentials')
        .values({ user_id: admin.id, password_hash: passwordHash })
        .execute();
    }

    await trx
      .insertInto('authentication.user_preferences')
      .values({ user_id: admin.id })
      .execute();

    return { status: 'initialized', adminUserId: admin.id } as const;
  });
}
