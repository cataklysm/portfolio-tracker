-- =============================================================================
-- Country-aware tax rules registry (Tax Phase P1)
-- =============================================================================
-- A tax rule binds a (country, asset class, date range) to:
--   * the JSON settings schemas the frontend renders (user-level + portfolio-level),
--   * simple, data-only parameters (rates, thresholds, holding periods), and
--   * a `calculation_engine_key` that names a CODE-DEFINED engine.
--
-- Decision (locked): rule definitions, schemas, metadata, valid date ranges, and
-- simple parameters are DB-backed and versioned here; the actual tax math stays
-- in code, referenced by `calculation_engine_key`. There is deliberately NO
-- executable rule logic or formula stored as JSON — the schema describes how to
-- render/validate settings, never how to compute tax.
--
-- These rows are reference data, not user data: they are global and ship with the
-- migration. The first residence supported is Germany (DE), split by asset class:
--   * de_securities_tax           — equities (funds/ETFs deferred; not included)
--   * de_crypto_private_disposal  — crypto private disposal (§23 EStG), gain-only
-- =============================================================================

CREATE TABLE portfolio.tax_rules (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code              char(2) NOT NULL,            -- ISO 3166-1 alpha-2
    rule_key                  text NOT NULL,               -- e.g. de_securities_tax
    rule_version              integer NOT NULL DEFAULT 1,
    asset_classes             text[] NOT NULL,             -- instrument asset_type values
    valid_from                date NOT NULL,
    valid_to                  date,                        -- null = open-ended
    user_settings_schema      jsonb NOT NULL,
    portfolio_settings_schema jsonb NOT NULL,
    parameters                jsonb NOT NULL DEFAULT '{}'::jsonb,
    calculation_engine_key    text NOT NULL,
    supported                 boolean NOT NULL DEFAULT true,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_to IS NULL OR valid_to >= valid_from),
    UNIQUE (rule_key, rule_version)
);
CREATE INDEX portfolio_tax_rules_lookup_idx
    ON portfolio.tax_rules (country_code, supported);

-- --- Seed: Germany ----------------------------------------------------------

-- German securities (equities). Funds/ETFs are intentionally excluded in v1:
-- their tax handling (incl. Teilfreistellung) is deferred.
INSERT INTO portfolio.tax_rules
    (country_code, rule_key, rule_version, asset_classes, valid_from,
     user_settings_schema, portfolio_settings_schema, parameters, calculation_engine_key)
VALUES (
    'DE', 'de_securities_tax', 1, ARRAY['equity'], '2009-01-01',
    '{"schemaKey":"de_user_tax_settings","version":1,"fields":[
        {"key":"churchTaxEnabled","label":"Church tax","type":"checkbox","default":false,"order":1,"helpText":"Enable if your broker withholds church tax (Kirchensteuer) for you."},
        {"key":"churchTaxRate","label":"Church tax rate","type":"select","required":true,"order":2,"visibleWhen":[{"field":"churchTaxEnabled","equals":true}],"options":[{"value":"0.08","label":"8% (Bavaria, Baden-Wuerttemberg)"},{"value":"0.09","label":"9% (other states)"}]},
        {"key":"taxCurrency","label":"Tax currency","type":"currency","default":"EUR","required":true,"order":3,"helpText":"Currency your tax is assessed in. Germany: EUR."}
    ]}'::jsonb,
    '{"schemaKey":"de_securities_portfolio_tax_settings","version":1,"fields":[
        {"key":"automaticTaxWithholding","label":"Automatic tax withholding","type":"checkbox","default":true,"order":1,"helpText":"German brokers usually withhold capital gains tax automatically. Disable for foreign brokers that do not."},
        {"key":"withholdingCurrency","label":"Withholding currency","type":"currency","default":"EUR","order":2,"visibleWhen":[{"field":"automaticTaxWithholding","equals":true}]},
        {"key":"exemptionOrderHistory","label":"Exemption order (Freistellungsauftrag)","type":"array","order":3,"visibleWhen":[{"field":"automaticTaxWithholding","equals":true}],"helpText":"The exemption order amount configured for this portfolio and the date it applies from. The consumed amount is derived from transactions, never entered.","itemFields":[
            {"key":"validFrom","label":"Valid from","type":"date","required":true,"order":1},
            {"key":"validTo","label":"Valid until","type":"date","order":2},
            {"key":"amount","label":"Amount","type":"money","required":true,"currencyField":"currency","min":0,"order":3},
            {"key":"currency","label":"Currency","type":"currency","default":"EUR","required":true,"order":4}
        ]}
    ]}'::jsonb,
    '{"capitalGainsTaxRate":0.25,"solidaritySurchargeRate":0.055}'::jsonb,
    'germanCapitalGainsTax'
);

-- German crypto private disposal (§23 EStG): gain/loss reporting only, no CGT.
INSERT INTO portfolio.tax_rules
    (country_code, rule_key, rule_version, asset_classes, valid_from,
     user_settings_schema, portfolio_settings_schema, parameters, calculation_engine_key)
VALUES (
    'DE', 'de_crypto_private_disposal', 1, ARRAY['crypto'], '2009-01-01',
    '{"schemaKey":"de_user_tax_settings","version":1,"fields":[
        {"key":"churchTaxEnabled","label":"Church tax","type":"checkbox","default":false,"order":1,"helpText":"Enable if your broker withholds church tax (Kirchensteuer) for you."},
        {"key":"churchTaxRate","label":"Church tax rate","type":"select","required":true,"order":2,"visibleWhen":[{"field":"churchTaxEnabled","equals":true}],"options":[{"value":"0.08","label":"8% (Bavaria, Baden-Wuerttemberg)"},{"value":"0.09","label":"9% (other states)"}]},
        {"key":"taxCurrency","label":"Tax currency","type":"currency","default":"EUR","required":true,"order":3,"helpText":"Currency your tax is assessed in. Germany: EUR."}
    ]}'::jsonb,
    '{"schemaKey":"de_crypto_portfolio_tax_settings","version":1,"fields":[
        {"key":"automaticTaxWithholding","label":"Automatic tax withholding","type":"checkbox","default":false,"order":1,"helpText":"Crypto private disposals are not subject to automatic German capital gains withholding. Usually off."},
        {"key":"taxReportingMode","label":"Tax reporting mode","type":"select","default":"taxableGainOnly","order":2,"options":[{"value":"taxableGainOnly","label":"Taxable gain only"}]}
    ]}'::jsonb,
    '{"holdingPeriodMonths":12,"taxFreeLimit":1000,"taxFreeLimitCurrency":"EUR"}'::jsonb,
    'germanCryptoTaxableGainOnly'
);
