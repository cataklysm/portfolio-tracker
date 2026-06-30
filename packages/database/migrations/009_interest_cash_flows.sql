-- =============================================================================
-- Portfolio — interest cash flows
-- =============================================================================
-- Adds `interest` as a first-class cash-flow type so portfolio-level (and, when
-- supplied, position-level) interest income can be booked alongside dividends.
-- Unlike dividend/cash_in_lieu (which require a position) and deposit/withdrawal
-- (which forbid one), `interest` leaves the position link OPTIONAL: it is
-- portfolio-level by default, but a position may be supplied for security/bond
-- interest. Ownership + same-portfolio for a supplied position are validated in
-- the service, not the schema.
-- =============================================================================

ALTER TABLE portfolio.cash_flows DROP CONSTRAINT cash_flows_type_check;
ALTER TABLE portfolio.cash_flows ADD CONSTRAINT cash_flows_type_check
    CHECK (type IN ('dividend', 'deposit', 'withdrawal', 'cash_in_lieu', 'interest'));

ALTER TABLE portfolio.cash_flows DROP CONSTRAINT cash_flows_check;
ALTER TABLE portfolio.cash_flows ADD CONSTRAINT cash_flows_check CHECK (
    (type IN ('dividend', 'cash_in_lieu') AND position_id IS NOT NULL)
    OR (type IN ('deposit', 'withdrawal') AND position_id IS NULL)
    OR (type = 'interest')
);
