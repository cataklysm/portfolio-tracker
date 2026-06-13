/**
 * Maps a user role to the capability scopes embedded in their access token.
 * Roles provide broad administration; scopes grant per-service capabilities.
 * Every downstream service enforces both the scope and resource ownership, so
 * a scope alone never grants access to another user's data.
 */

const USER_SCOPES = [
  'profile:read',
  'profile:write',
  'portfolio:read',
  'portfolio:write',
  'instruments:read',
  'instruments:write',
  'market:read',
  'fundamentals:read',
  'events:read',
  'insights:read',
  'insights:write',
] as const;

const ADMIN_SCOPES = [...USER_SCOPES, 'users:read', 'users:write', 'system:admin'] as const;

export function scopesForRole(role: 'user' | 'admin'): string[] {
  return role === 'admin' ? [...ADMIN_SCOPES] : [...USER_SCOPES];
}

/**
 * Scopes a personal access token may carry. Admin-management capabilities are
 * never grantable to a PAT, so a leaked API credential can't administer the
 * instance even for an admin user — it's confined to per-service data access.
 */
const PAT_EXCLUDED_SCOPES = new Set(['users:read', 'users:write', 'system:admin']);

export function grantableScopes(role: 'user' | 'admin'): string[] {
  return scopesForRole(role).filter((scope) => !PAT_EXCLUDED_SCOPES.has(scope));
}
