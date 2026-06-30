-- =============================================================================
-- Insights — analyst assessment history (fair value + target zones)
-- =============================================================================
-- Analyst fair values and target zones used to be replaced wholesale on every
-- provider refresh, so their effective_date showed "last fetched" rather than
-- "since when this value holds". Switch to an append-only history: a new value
-- is only written when it actually changes; the previous current row is marked
-- outdated via `superseded_at` (kept, not deleted). The current value is the row
-- with `superseded_at IS NULL`; the full series feeds a UI trend line.
-- =============================================================================

ALTER TABLE insights.fair_value_estimates ADD COLUMN superseded_at timestamptz;
ALTER TABLE insights.price_targets ADD COLUMN superseded_at timestamptz;

-- At most one current global analyst record per instrument.
CREATE UNIQUE INDEX insights_fair_values_current_analyst_uq
    ON insights.fair_value_estimates (instrument_id)
    WHERE method = 'analyst' AND user_id IS NULL AND superseded_at IS NULL;

CREATE UNIQUE INDEX insights_price_targets_current_analyst_uq
    ON insights.price_targets (instrument_id)
    WHERE source = 'analyst' AND user_id IS NULL AND superseded_at IS NULL;
