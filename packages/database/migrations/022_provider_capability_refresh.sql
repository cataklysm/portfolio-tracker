-- =============================================================================
-- Providers service — per-(provider × capability) refresh cadence
-- =============================================================================
-- Replaces the three hard-coded env intervals (MARKET/FUNDAMENTALS/EVENTS_
-- REFRESH_INTERVAL_MS) with admin-editable, dynamic cadence configured per
-- provider and capability. Each refresher (market quotes/analyst/fx, fundamentals,
-- events) runs a short heartbeat and treats `refresh_interval_ms` as a freshness
-- threshold: a listing/instrument is only re-fetched once its newest stored datum
-- is at least this old. This naturally absorbs poll jitter — due-ness is measured
-- from the last stored timestamp, not the last tick.
--
-- `save_resolution_ms` applies to `quotes` only: providers that return an intraday
-- series (e.g. lstc) are downsampled to at most one stored point per this span,
-- counted from the last point already saved. NULL elsewhere.
--
-- `chart` and `symbol_search` are intentionally absent: chart is a manual/backfill
-- action and symbol_search is on-demand, so neither is scheduled.
--
-- Keyed by provider name only (no FK to provider_settings) to match the existing
-- loose coupling; an orphaned row is simply never consulted.
-- =============================================================================

CREATE TABLE providers.provider_capability_refresh (
    provider            text NOT NULL,
    capability          text NOT NULL,
    refresh_interval_ms integer NOT NULL CHECK (refresh_interval_ms >= 1000),
    save_resolution_ms  integer CHECK (save_resolution_ms IS NULL OR save_resolution_ms >= 1000),
    enabled             boolean NOT NULL DEFAULT true,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, capability)
);

-- Seed current behavior. Capabilities are the feed-group representatives the rest
-- of the system already uses: `quotes` (price feed; chart shares the provider but
-- is unscheduled), `earnings` (the bundled events feed: earnings + corporate
-- actions + news), `fundamentals`, `analyst`, and `fx`.
--   yahoo: quotes 5m (save 5m — batch endpoint returns latest only, no intraday),
--          events/fundamentals/analyst hourly (matches the old 1h env defaults).
--   lstc:  quotes every 5m, but its intraday series is downsampled to 1 point/min.
--   ecb:   fx once a day.
INSERT INTO providers.provider_capability_refresh
    (provider, capability, refresh_interval_ms, save_resolution_ms)
VALUES
    ('yahoo', 'quotes',       300000, 300000),
    ('yahoo', 'earnings',     3600000, NULL),
    ('yahoo', 'fundamentals', 3600000, NULL),
    ('yahoo', 'analyst',      3600000, NULL),
    ('lstc',  'quotes',       300000, 60000),
    ('ecb',   'fx',           86400000, NULL)
ON CONFLICT (provider, capability) DO NOTHING;
