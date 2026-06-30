-- =============================================================================
-- Portfolio — dividend event linkage on cash flows
-- =============================================================================
-- Links an income cash flow back to the objective `events` corporate-action that
-- prompted it (a stable string id + version), and records the per-share economics
-- captured at booking time. `corporate_action_id` / `corporate_action_application_id`
-- stay for the internal applied-split link; `source_event_id` is the canonical
-- external events-service handle. All numeric columns are non-negative when present.
-- A partial unique index prevents booking the same event twice for the same user
-- position; `type` is in the key so one event may still yield both a dividend and
-- a cash-in-lieu (e.g. scrip/fractional settlement). portfolio_id is intentionally
-- excluded — a position can be transferred and the cash flow keeps its snapshot.
-- =============================================================================

ALTER TABLE portfolio.cash_flows
    ADD COLUMN source_event_id       text,
    ADD COLUMN source_event_version  integer,
    ADD COLUMN source_event_type     text,
    ADD COLUMN ex_date               date,
    ADD COLUMN amount_per_share      numeric(38, 12)
                                     CHECK (amount_per_share IS NULL OR amount_per_share >= 0),
    ADD COLUMN quantity_at_ex_date   numeric(38, 12)
                                     CHECK (quantity_at_ex_date IS NULL OR quantity_at_ex_date >= 0),
    ADD COLUMN expected_gross_amount numeric(38, 12)
                                     CHECK (expected_gross_amount IS NULL OR expected_gross_amount >= 0);

CREATE UNIQUE INDEX portfolio_cash_flows_event_booking_unique_idx
    ON portfolio.cash_flows (user_id, position_id, source_event_id, type)
    WHERE source_event_id IS NOT NULL
      AND position_id IS NOT NULL
      AND type IN ('dividend', 'cash_in_lieu');
