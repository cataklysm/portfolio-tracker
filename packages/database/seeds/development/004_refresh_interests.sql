-- Development-only: seed market.refresh_interests so the market refresh
-- scheduler tracks every held listing at startup.
--
-- In production these rows are built by the market service consuming
-- portfolio.position.opened events off the Redis stream. The dev seeds load the
-- tables directly (bypassing the event stream), so no interest rows would ever
-- exist and the scheduler would fetch nothing. Here we materialize the same
-- projection the event handler would: one active 'position' interest per OPEN
-- position, keyed by the position id (the aggregate id the handler uses as
-- interest_id), so a later real event upserts the same row rather than
-- duplicating it.

INSERT INTO market.refresh_interests
    (interest_id, listing_id, interest_type, active, aggregate_version)
SELECT id, listing_id, 'position', true, 1
FROM portfolio.positions
WHERE state = 'open'
ON CONFLICT (interest_id) DO NOTHING;
