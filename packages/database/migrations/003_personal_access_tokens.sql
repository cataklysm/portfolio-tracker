-- =============================================================================
-- Authentication service — personal access tokens (PATs)
-- =============================================================================
-- Long-lived, user-labeled API credentials for programmatic access (e.g. an MCP
-- server). A PAT is an opaque secret; only its SHA-256 hash is stored. It is not
-- a bearer token itself — it is exchanged at POST /auth/token for a short-lived
-- access JWT carrying the PAT's scope subset, so the stateless JWKS verification
-- downstream is unchanged and revocation (revoked_at) takes effect within one
-- access-token lifetime.

CREATE TABLE authentication.personal_access_tokens (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES authentication.users (id) ON DELETE CASCADE,
    name          text NOT NULL,
    token_hash    text NOT NULL UNIQUE,
    scopes        text[] NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_used_at  timestamptz,
    expires_at    timestamptz,
    revoked_at    timestamptz
);
CREATE INDEX pat_active_by_user_idx
    ON authentication.personal_access_tokens (user_id) WHERE revoked_at IS NULL;
