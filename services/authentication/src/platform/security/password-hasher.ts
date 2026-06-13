import argon2 from 'argon2';

/**
 * Argon2id password hashing. Local authentication makes the application
 * responsible for credential storage, so the algorithm is set explicitly
 * rather than relying on library defaults.
 */
export class PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
