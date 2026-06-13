import { createHash, randomBytes } from 'node:crypto';

/**
 * Personal access tokens are opaque high-entropy secrets prefixed `pat_`. Only
 * their SHA-256 hash is ever stored, so a database leak does not expose usable
 * tokens. The prefix makes the credential recognizable (and greppable in logs
 * to catch accidental leaks). 32 random bytes ⇒ 256 bits of entropy, so a plain
 * hash lookup is safe (no need for a slow password KDF).
 */
const TOKEN_PREFIX = 'pat_';

export function generateApiToken(): { raw: string; hash: string } {
  const raw = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  return { raw, hash: hashApiToken(raw) };
}

export function hashApiToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function looksLikeApiToken(raw: string): boolean {
  return raw.startsWith(TOKEN_PREFIX);
}
