-- =============================================================================
-- User & portfolio tax settings storage (Tax Phase P2)
-- =============================================================================
-- The actual saved tax settings values (validated against the JSON schemas in
-- portfolio.tax_rules). Both live in the portfolio service so validation runs
-- where the schemas live, and so they sit next to the tax engines that consume
-- them. Tax RESIDENCE remains authoritative in the authentication service; these
-- rows hold only the calculation inputs.
--
--  * portfolio.user_tax_settings — per-user, residence-level inputs
--    (e.g. churchTaxEnabled, churchTaxRate, taxCurrency). One row per user;
--    overwritten on change. `country_code` records which residence the saved
--    values were entered for, so the right rule schema validates them.
--
--  * portfolio.portfolios.tax_rule_key / tax_settings — per-portfolio settings
--    (automaticTaxWithholding, exemptionOrderHistory, withholdingCurrency,
--    taxReportingMode). `tax_rule_key` names which tax rule governs the portfolio
--    (e.g. de_securities_tax); the settings are validated against that rule's
--    portfolio_settings_schema. Both nullable: a portfolio with no tax rule
--    configured simply has no tax estimate.
-- =============================================================================

CREATE TABLE portfolio.user_tax_settings (
    user_id       uuid PRIMARY KEY,             -- external authentication user ID
    country_code  char(2) NOT NULL,             -- ISO 3166-1 alpha-2 (the residence)
    settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE portfolio.portfolios
    ADD COLUMN tax_rule_key text,
    ADD COLUMN tax_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
