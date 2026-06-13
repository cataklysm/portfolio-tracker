import { createHash, randomBytes } from 'node:crypto';

/**
 * Refresh tokens are opaque high-entropy random strings. Only their SHA-256
 * hash is ever stored, so a database leak does not expose usable tokens.
 */
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');
  return { raw, hash: hashRefreshToken(raw) };
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
