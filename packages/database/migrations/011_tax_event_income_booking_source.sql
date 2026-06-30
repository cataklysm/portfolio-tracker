-- =============================================================================
-- Portfolio — income-booking tax event source
-- =============================================================================
-- Tax events created automatically from an income cash flow's `tax_components`
-- are marked `source = 'income_booking'`. This distinguishes them from manually
-- recorded broker tax and from realized-gain tax, so reporting can keep income
-- tax out of the realized-P&L after-tax calculation (GET /reporting/tax).
-- =============================================================================

ALTER TABLE portfolio.tax_events DROP CONSTRAINT tax_events_source_check;
ALTER TABLE portfolio.tax_events ADD CONSTRAINT tax_events_source_check
    CHECK (source IN ('manual', 'import', 'broker_api', 'provider', 'corporate_action', 'income_booking'));
