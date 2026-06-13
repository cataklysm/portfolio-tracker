# authentication

Central internal **token authority** for the platform. Regardless of login
method, this service issues the application's own short-lived internal access
tokens, which every other service validates via this service's JWKS.

## Owned capabilities

- First-start setup (`instance_config`, initial admin) — idempotent, advisory-
  locked bootstrap, available as a CLI and an HTTP endpoint.
- Local authentication (argon2id) with failed-attempt lockout.
- Revocable, rotating refresh-token sessions with reuse detection.
- Internal access-token signing and JWKS publication.
- The authenticated user's own profile and preferences.

External OIDC (Authentik, Authorization Code + PKCE) is a planned module behind
the same token authority and is not yet implemented in this slice.

## Modules

| Module | Responsibility |
|---|---|
| `setup` | First-start bootstrap of instance config and the initial admin |
| `keys` | RS256 access-token signing and JWKS endpoint |
| `sessions` | Local login, refresh-token rotation, logout |
| `profile` | `GET /me`, `PATCH /me/preferences` |

Internal feature-first structure: `domain/` (scopes, refresh-token hashing),
`application/` (use cases + ports), `infrastructure/` (Kysely adapters),
`http/` (Fastify routes + TypeBox contracts). `app.ts` is the composition root;
`server.ts` manages process lifecycle.

## Public HTTP contracts

| Method & path | Exposure | Auth | Notes |
|---|---|---|---|
| `POST /auth/setup` | public | service | Guarded by `x-setup-secret`; one-time |
| `POST /auth/login` | public | none | Local credentials → token pair |
| `POST /auth/refresh` | public | none | Rotates the refresh token |
| `POST /auth/logout` | public | none | Revokes the presented refresh token |
| `GET /.well-known/jwks.json` | public | none | Token-verification keys |
| `GET /me` | public | user (`profile:read`) | Current user + preferences |
| `PATCH /me/preferences` | public | user (`profile:write`) | Update preferences |
| `GET /health/{live,ready,startup}` | internal | none | Probes |
| `GET /metrics` | internal | none | Prometheus metrics |

Access-token claims: `sub`, `role`, `scopes`, `sid`, `iss`, `aud`, `iat`,
`exp`, `jti`.

## Persistence ownership

Owns the `authentication.*` schema: `instance_config`, `users`,
`local_credentials`, `invitations`, `refresh_tokens`, `user_preferences`. No
other service reads or writes these tables; cross-service access is over HTTP.

## External dependencies

PostgreSQL (`AUTH_DATABASE_URL`, falls back to shared `DATABASE_URL`). No Redis
dependency in the current feature set.

## Local run / test

```bash
pnpm --filter @portfolio/authentication bootstrap   # first-start admin (CLI)
pnpm --filter @portfolio/authentication dev          # run with watch
pnpm --filter @portfolio/authentication typecheck
```
