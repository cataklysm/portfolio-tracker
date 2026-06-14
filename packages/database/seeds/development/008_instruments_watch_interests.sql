-- Development-only: seed instruments.watch_interests so the canonical watch-set
-- authority (instruments service) reports every held listing at startup.
--
-- In production these rows are built by the instruments service consuming
-- portfolio.position.opened / watchlist.added events off the Redis stream. The
-- dev seeds load the tables directly (bypassing the event stream), so without
-- this the watch-set snapshot would be empty. We materialize the same projection
-- the event handler would: one active 'position' interest per OPEN position,
-- keyed by the position id (the aggregate id used as interest_id), so a later
-- real event upserts the same row rather than duplicating it.
--
-- Mirrors seed 004 (market.refresh_interests); once the per-service projections
-- are dropped (Phase 5 of the consolidation) this becomes the single seed.

INSERT INTO instruments.watch_interests
    (interest_id, listing_id, interest_type, active, aggregate_version)
SELECT id, listing_id, 'position', true, 1
FROM portfolio.positions
WHERE state = 'open'
ON CONFLICT (interest_id) DO NOTHING;
