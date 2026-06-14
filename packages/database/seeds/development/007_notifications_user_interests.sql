-- Development-only: seed notifications.user_interests so the alert evaluator has
-- per-user holdings to evaluate at startup.
--
-- In production these rows are built by the notifications service consuming
-- portfolio.position.opened events (the envelope carries user_id). The dev seeds
-- load tables directly, so we materialize the same projection here: one active
-- 'position' interest per OPEN position, carrying its owning user, keyed by the
-- position id (the aggregate id the event handler uses as interest_id) so a
-- later real event upserts the same row.

INSERT INTO notifications.user_interests
    (interest_id, user_id, listing_id, interest_type, active, aggregate_version)
SELECT p.id, pf.user_id, p.listing_id, 'position', true, 1
FROM portfolio.positions p
JOIN portfolio.portfolios pf ON pf.id = p.portfolio_id
WHERE p.state = 'open' AND pf.archived_at IS NULL
ON CONFLICT (interest_id) DO NOTHING;
