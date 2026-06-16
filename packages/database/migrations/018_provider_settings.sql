-- =============================================================================
-- Providers service — admin-editable provider settings (provider-intrinsic)
-- =============================================================================
-- The providers service was previously stateless (single egress, no DB). It now
-- owns the provider-intrinsic, admin-editable configuration: which providers are
-- enabled, their class (symbol-based vs reference/FX), their static data-quality
-- grade (admin information only — it never drives routing; there is no failover),
-- and their refresh pacing (batch size / rate limits / concurrency) which the
-- market refresh scheduler reads to chunk and throttle a full-catalog sweep.
--
-- Instrument-coupled mappings (which provider each instrument uses per capability,
-- and each provider's symbol per listing) stay in the instruments service. The
-- two reference each other only by provider name — no cross-schema foreign keys.
--
-- `provider_class`:
--   'symbol'    — symbol-based source (quotes/chart/fundamentals/…); MUST implement
--                 symbol_search.
--   'reference' — reference-data/FX source (e.g. ECB); exempt from symbol_search.
--
-- `data_quality` is the provider-level default grade; `capability_quality` holds
-- per-capability overrides ({"fundamentals": "low", ...}). `max_batch_size` NULL
-- means the provider only accepts single-symbol queries (the scheduler throttles
-- rather than batches).
-- =============================================================================

CREATE SCHEMA providers;

CREATE TABLE providers.provider_settings (
    provider            text PRIMARY KEY,
    enabled             boolean NOT NULL DEFAULT true,
    provider_class      text NOT NULL CHECK (provider_class IN ('symbol', 'reference')),
    data_quality        text NOT NULL DEFAULT 'unknown'
                        CHECK (data_quality IN ('high', 'medium', 'low', 'unknown')),
    capability_quality  jsonb NOT NULL DEFAULT '{}'::jsonb,
    max_batch_size      integer CHECK (max_batch_size IS NULL OR max_batch_size > 0),
    rate_limit_per_min  integer CHECK (rate_limit_per_min IS NULL OR rate_limit_per_min > 0),
    max_concurrency     integer NOT NULL DEFAULT 4 CHECK (max_concurrency > 0),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Seed the two providers that exist in code today, preserving current behavior on
-- first boot. Values are admin-editable afterwards.
--   Yahoo: broad symbol coverage, unofficial integration → "medium" quality;
--          batch quote endpoint (kept conservative, the scheduler chunked at 25).
--   ECB:   authoritative EUR reference rates → "high"; single bulk FX call, so no
--          per-symbol batching and low concurrency.
INSERT INTO providers.provider_settings
    (provider, enabled, provider_class, data_quality, max_batch_size, rate_limit_per_min, max_concurrency)
VALUES
    ('yahoo', true, 'symbol',    'medium', 50,   NULL, 4),
    ('ecb',   true, 'reference', 'high',   NULL, NULL, 1)
ON CONFLICT (provider) DO NOTHING;
