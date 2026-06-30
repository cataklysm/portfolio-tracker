-- =============================================================================
-- Providers — per-cycle refresh budget
-- =============================================================================
-- For rate-constrained providers (e.g. the unofficial lstc API) the quote sweep
-- must not try to refresh every due listing in one pass. `max_per_cycle` caps how
-- many of a provider's listings are fetched per sweep; combined with oldest-first
-- selection in the market refresh, this rotates fairly across all assets without
-- hammering the provider or letting any asset go stale for hours. NULL = no cap
-- (current behaviour, e.g. yahoo's batch endpoint).
-- =============================================================================

ALTER TABLE providers.provider_settings
    ADD COLUMN max_per_cycle integer CHECK (max_per_cycle IS NULL OR max_per_cycle > 0);
