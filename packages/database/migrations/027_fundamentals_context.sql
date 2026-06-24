-- =============================================================================
-- Fundamentals service — snapshot context (currency, provider as-of, quality)
-- =============================================================================
-- The asset-detail fundamentals section needs to judge whether a value is
-- current, stale, or thin. Promote `currency` to a real column (it was buried in
-- raw_payload), store the provider's own as-of timestamp distinctly from our
-- retrieval time, and record a coarse completeness grade. NUMERIC ratios remain
-- trailing/actual snapshot values — Yahoo exposes no fiscal_year/period for the
-- typed ratios, so those stay unrepresented rather than invented.
-- =============================================================================

ALTER TABLE fundamentals.fundamentals ADD COLUMN currency text;
ALTER TABLE fundamentals.fundamentals ADD COLUMN provider_as_of timestamptz;
ALTER TABLE fundamentals.fundamentals ADD COLUMN quality text;
