-- =============================================================================
-- Portfolio — foreign-currency income: source economics + broker FX
-- =============================================================================
-- A foreign dividend/coupon is declared and taxed in a source currency (e.g. USD),
-- the broker converts the net amount at a fixed broker FX rate, and the portfolio
-- is credited in the settlement currency (e.g. EUR). The existing booking fields
-- (`gross_amount`, `withholding_tax`, `fee`, `net_amount`, `currency`) keep their
-- meaning as the SETTLEMENT-currency, broker-reconciled amounts that reporting uses.
--
-- This migration adds two nullable layers on top, so the original source economics
-- and the broker's conversion remain queryable without changing the authoritative
-- booked amount:
--   * source_* — the dividend/coupon economics in the original (source) currency.
--   * broker_fx_* — the fixed rate the broker applied, stored as a DIRECT
--     source->settlement rate (units of `broker_fx_to_currency` per 1 unit of
--     `broker_fx_from_currency`); NOT the market service's EUR-pivot convention.
--
-- Existing EUR-only / same-currency rows stay valid: every new column is nullable
-- and no backfill is required. Cross-field invariants that do not depend on
-- arithmetic rounding are enforced here as CHECKs; the full conditional logic and
-- the client-supplied-net tolerance live in the cash-flow service.
-- =============================================================================

ALTER TABLE portfolio.cash_flows
    ADD COLUMN source_currency          char(3),
    ADD COLUMN source_gross_amount      numeric(38, 12)
                                        CHECK (source_gross_amount IS NULL OR source_gross_amount >= 0),
    ADD COLUMN source_withholding_tax   numeric(38, 12)
                                        CHECK (source_withholding_tax IS NULL OR source_withholding_tax >= 0),
    ADD COLUMN source_fee               numeric(38, 12)
                                        CHECK (source_fee IS NULL OR source_fee >= 0),
    ADD COLUMN source_net_amount        numeric(38, 12)
                                        CHECK (source_net_amount IS NULL OR source_net_amount >= 0),
    ADD COLUMN source_amount_per_share  numeric(38, 12)
                                        CHECK (source_amount_per_share IS NULL OR source_amount_per_share >= 0),
    ADD COLUMN broker_fx_rate           numeric(38, 18)
                                        CHECK (broker_fx_rate IS NULL OR broker_fx_rate > 0),
    ADD COLUMN broker_fx_from_currency  char(3),
    ADD COLUMN broker_fx_to_currency    char(3),
    ADD COLUMN broker_fx_rate_date      date;

-- A source amount without a source currency is meaningless.
ALTER TABLE portfolio.cash_flows ADD CONSTRAINT cash_flows_source_currency_presence_check CHECK (
    source_currency IS NOT NULL
    OR (source_gross_amount IS NULL
        AND source_withholding_tax IS NULL
        AND source_fee IS NULL
        AND source_net_amount IS NULL
        AND source_amount_per_share IS NULL)
);

-- When the source currency differs from the settlement currency the full source
-- breakdown and a coherent broker FX (direction source->settlement) are mandatory.
-- Same-currency bookings (source omitted or equal to settlement) are unconstrained.
ALTER TABLE portfolio.cash_flows ADD CONSTRAINT cash_flows_source_settlement_check CHECK (
    source_currency IS NULL
    OR source_currency = currency
    OR (
        source_gross_amount IS NOT NULL
        AND source_withholding_tax IS NOT NULL
        AND source_net_amount IS NOT NULL
        AND broker_fx_rate IS NOT NULL
        AND broker_fx_rate_date IS NOT NULL
        AND broker_fx_from_currency = source_currency
        AND broker_fx_to_currency = currency
    )
);

-- A broker FX rate is only meaningful with its direction and effective date.
ALTER TABLE portfolio.cash_flows ADD CONSTRAINT cash_flows_broker_fx_coherence_check CHECK (
    broker_fx_rate IS NULL
    OR (broker_fx_from_currency IS NOT NULL
        AND broker_fx_to_currency IS NOT NULL
        AND broker_fx_rate_date IS NOT NULL)
);

-- Source net reconciles exactly (numeric is exact; the service stores the computed
-- value, only accepting a client-supplied net within tolerance before persisting).
ALTER TABLE portfolio.cash_flows ADD CONSTRAINT cash_flows_source_net_identity_check CHECK (
    source_net_amount IS NULL
    OR source_net_amount = source_gross_amount - source_withholding_tax - COALESCE(source_fee, 0)
);

-- The original-source breakdown of an income booking's withheld tax. `tax_events`
-- remain the broker-tax ledger in settlement currency; this table preserves the
-- source-currency detail for explanation and FX reconciliation. Rows are owned by
-- their cash flow and cascade-deleted with it.
CREATE TABLE portfolio.cash_flow_tax_components (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cash_flow_id        uuid NOT NULL
                        REFERENCES portfolio.cash_flows(id) ON DELETE CASCADE,
    component           text NOT NULL CHECK (component IN
                        ('capital_income', 'solidarity', 'church',
                         'foreign_withholding', 'generic')),
    source_amount       numeric(38, 12) NOT NULL CHECK (source_amount >= 0),
    source_currency     char(3) NOT NULL,
    settlement_amount   numeric(38, 12) NOT NULL CHECK (settlement_amount >= 0),
    settlement_currency char(3) NOT NULL,
    booking_date        date NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_cash_flow_tax_components_cash_flow_idx
    ON portfolio.cash_flow_tax_components (cash_flow_id);
