-- =============================================================================
-- Recorded broker tax + after-tax P&L (P0)
-- =============================================================================
-- Two additions, one per owning service:
--
--  * authentication.tax_residencies — effective-dated tax residence of a user.
--    Controls jurisdiction-specific labels/disclosures only; the tracker never
--    calculates local tax from it. The initial product supports one primary
--    residence but the row model (valid_from/valid_until, is_primary) is already
--    extensible to a history and to multiple jurisdictions.
--
--  * portfolio.tax_events — the actual tax withheld/refunded as booked by the
--    broker. The broker remains the source of truth (exemption orders, loss pots,
--    fund rules, foreign-tax credits, corrections); the tracker only records what
--    happened and derives after-tax reporting from these bookings. A zero balance
--    means "no tax recorded", never "no tax liability". One event may attach to a
--    transaction, a dividend cash flow, a position, a whole portfolio, or stand
--    alone (a year-end broker-level correction) — so every link is optional.
-- =============================================================================

-- --- Tax residence (authentication) -----------------------------------------

CREATE TABLE authentication.tax_residencies (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES authentication.users(id) ON DELETE CASCADE,
    country_code  char(2) NOT NULL,              -- ISO 3166-1 alpha-2
    valid_from    date NOT NULL,
    valid_until   date,                          -- null = current (open-ended)
    is_primary    boolean NOT NULL DEFAULT true,
    confirmed_at  timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE INDEX authentication_tax_residencies_user_idx
    ON authentication.tax_residencies (user_id, valid_from DESC);
-- At most one current primary residence per user.
CREATE UNIQUE INDEX authentication_tax_residencies_current_primary_idx
    ON authentication.tax_residencies (user_id)
    WHERE valid_until IS NULL AND is_primary;

-- --- Tax events (portfolio) --------------------------------------------------

CREATE TABLE portfolio.tax_events (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL,            -- external authentication user ID
    component          text NOT NULL CHECK (component IN
                       ('capital_income', 'solidarity', 'church',
                        'foreign_withholding', 'generic')),
    direction          text NOT NULL CHECK (direction IN ('withheld', 'refunded')),
    amount             numeric(38, 12) NOT NULL CHECK (amount >= 0),
    currency           char(3) NOT NULL,
    booking_date       date NOT NULL,
    source             text NOT NULL DEFAULT 'manual' CHECK (source IN
                       ('manual', 'import', 'broker_api', 'provider', 'corporate_action')),
    note               text,
    -- Optional attribution links; all nullable (a correction may belong to none).
    transaction_id     uuid REFERENCES portfolio.transactions(id) ON DELETE SET NULL,
    cash_flow_id       uuid REFERENCES portfolio.cash_flows(id) ON DELETE SET NULL,
    position_id        uuid REFERENCES portfolio.positions(id) ON DELETE SET NULL,
    portfolio_id       uuid REFERENCES portfolio.portfolios(id) ON DELETE CASCADE,
    -- Forward-compat columns for the future broker-account and import-batch
    -- models; not yet populated or exposed through the API.
    broker_account_id  uuid,
    statement_id       uuid,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_tax_events_user_date_idx
    ON portfolio.tax_events (user_id, booking_date);
CREATE INDEX portfolio_tax_events_portfolio_idx
    ON portfolio.tax_events (portfolio_id) WHERE portfolio_id IS NOT NULL;
CREATE INDEX portfolio_tax_events_position_idx
    ON portfolio.tax_events (position_id) WHERE position_id IS NOT NULL;
