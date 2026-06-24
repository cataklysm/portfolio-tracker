-- =============================================================================
-- Market service — trading volume on stored quotes
-- =============================================================================
-- The asset-detail chart wants real activity bars under the price line, which
-- requires a per-point volume. Yahoo's chart bars already carry `volume`; the
-- providers→market pipeline simply dropped it. Add a nullable column to the
-- normalized quote cache/history so both the intraday series and the daily-close
-- history can expose it. NULL for providers/points that don't supply a volume
-- (e.g. the latest-tick write and lstc's history fallback), so the UI can fall
-- back to a neutral "price activity" rendering rather than faking volume.
-- =============================================================================

ALTER TABLE market.price_quotes ADD COLUMN volume numeric;
