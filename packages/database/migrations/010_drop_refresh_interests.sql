-- =============================================================================
-- Watch-set consolidation, Phase 5 — drop the per-service interest projections
-- =============================================================================
-- The market, fundamentals, and events services no longer maintain their own
-- copy of the watched-listing projection: they consume the canonical, deduped
-- watch set owned by the instruments service (instruments.watch_interests, served
-- as a snapshot + instruments.watch.* deltas) and hold it in memory. These three
-- now-dead tables are dropped. Per-service refresh *scheduling/freshness* state
-- (market.data_refresh_state, events.refresh_state) is unrelated and stays.

DROP TABLE IF EXISTS market.refresh_interests;
DROP TABLE IF EXISTS fundamentals.refresh_interests;
DROP TABLE IF EXISTS events.refresh_interests;
