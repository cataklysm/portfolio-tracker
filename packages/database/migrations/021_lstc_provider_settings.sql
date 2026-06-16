-- =============================================================================
-- Providers service — seed the Lang & Schwarz TradeCenter (lstc) provider row
-- =============================================================================
-- L&S TradeCenter (MIC LSSI) is a public chart API needing no credential. The
-- adapter is always constructed, but only routes when this row is enabled:
--   UPDATE providers.provider_settings SET enabled = true WHERE provider = 'lstc';
-- or via the admin endpoint. Seeded DISABLED so it never activates implicitly.
--
-- 'symbol' class (implements symbol_search). EUR single-venue source with clean
-- daily history. No batch endpoint → max_batch_size NULL (single-symbol; the
-- scheduler issues one request per symbol). Quality 'unknown' until measured.
-- =============================================================================

INSERT INTO providers.provider_settings
    (provider, enabled, provider_class, data_quality, capability_quality, max_batch_size, rate_limit_per_min, max_concurrency)
VALUES
    ('lstc', false, 'symbol', 'unknown', '{}'::jsonb, NULL, NULL, 2)
ON CONFLICT (provider) DO NOTHING;
