-- =============================================================================
-- Portfolio Intelligence Platform — consolidated fresh-install baseline
-- PostgreSQL 13+
--
-- This is the single baseline schema, consolidated from the original numbered
-- migrations 001–027 (all of which had been applied). The historical ALTER/DROP
-- steps have been folded into the final table definitions; dropped objects
-- (the per-service *.refresh_interests projections, instruments.watch_interests,
-- notifications.preferences, instruments.underlying_identifier) are simply absent.
-- Data-only migrations (backfills) are dropped except where they seed reference
-- data the application depends on (currencies, tax rules, benchmark catalog,
-- provider settings/cadence, per-instrument provider selection).
--
-- The migration runner tracks applied files by name in schema_migrations, so an
-- already-migrated database (which recorded 001_schema.sql long ago) skips this
-- file untouched; a fresh database builds the whole schema from it. NOTE: this
-- assumes every environment was already at migration 027 before consolidation.
--
-- Service ownership is represented by PostgreSQL schemas in the default shared
-- database. There are no foreign keys across service schemas. Stable external
-- IDs are used at service boundaries so the schemas can later be deployed to
-- separate databases without changing domain contracts.
-- =============================================================================

CREATE SCHEMA authentication;
CREATE SCHEMA instruments;
CREATE SCHEMA portfolio;
CREATE SCHEMA market;
CREATE SCHEMA fundamentals;
CREATE SCHEMA events;
CREATE SCHEMA insights;
CREATE SCHEMA notifications;
CREATE SCHEMA providers;

-- =============================================================================
-- Authentication service
-- =============================================================================

CREATE TABLE authentication.instance_config (
    singleton               boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    allow_local_auth        boolean NOT NULL DEFAULT true,
    allow_oidc_auth         boolean NOT NULL DEFAULT false,
    oidc_issuer_url         text,
    oidc_client_id          text,
    initialized_at          timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE authentication.users (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email                   text NOT NULL,
    display_name            text,
    role                    text NOT NULL DEFAULT 'user'
                            CHECK (role IN ('user', 'admin')),
    active                  boolean NOT NULL DEFAULT true,
    external_issuer         text,
    external_subject        text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (external_issuer IS NULL AND external_subject IS NULL)
        OR (external_issuer IS NOT NULL AND external_subject IS NOT NULL)
    )
);
CREATE UNIQUE INDEX authentication_users_email_uq
    ON authentication.users (lower(email));
CREATE UNIQUE INDEX authentication_users_external_subject_uq
    ON authentication.users (external_issuer, external_subject)
    WHERE external_subject IS NOT NULL;

CREATE TABLE authentication.local_credentials (
    user_id                 uuid PRIMARY KEY
                            REFERENCES authentication.users(id) ON DELETE CASCADE,
    password_hash           text NOT NULL,
    password_updated_at     timestamptz NOT NULL DEFAULT now(),
    failed_attempts         integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until            timestamptz,
    reset_token_hash        text,
    reset_token_expires_at  timestamptz
);

CREATE TABLE authentication.invitations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email                   text NOT NULL,
    role                    text NOT NULL DEFAULT 'user'
                            CHECK (role IN ('user', 'admin')),
    token_hash              text NOT NULL UNIQUE,
    invited_by              uuid NOT NULL
                            REFERENCES authentication.users(id),
    expires_at              timestamptz NOT NULL,
    accepted_at             timestamptz,
    revoked_at              timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX authentication_invitations_email_idx
    ON authentication.invitations (lower(email));

CREATE TABLE authentication.refresh_tokens (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash              text NOT NULL UNIQUE,
    user_id                 uuid NOT NULL
                            REFERENCES authentication.users(id) ON DELETE CASCADE,
    session_id              uuid NOT NULL,
    expires_at              timestamptz NOT NULL,
    revoked_at              timestamptz,
    replaced_by_token_id    uuid
                            REFERENCES authentication.refresh_tokens(id),
    created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX authentication_refresh_tokens_user_idx
    ON authentication.refresh_tokens (user_id, session_id);

CREATE TABLE authentication.user_preferences (
    user_id                         uuid PRIMARY KEY
                                    REFERENCES authentication.users(id) ON DELETE CASCADE,
    reporting_currency              char(3) NOT NULL DEFAULT 'EUR',
    realization_accounting_method   text NOT NULL DEFAULT 'fifo'
                                    CHECK (realization_accounting_method IN
                                           ('fifo', 'lifo', 'average_cost')),
    combined_headline_metric        text NOT NULL DEFAULT 'total_return',
    combined_benchmark              jsonb NOT NULL DEFAULT
                                    '{"type":"index","identifier":"MSCI_WORLD"}'::jsonb,
    locale                          text,
    timezone                        text,
    avatar_color                    text NOT NULL DEFAULT 'sky',
    updated_at                      timestamptz NOT NULL DEFAULT now()
);

-- Long-lived, user-labeled API credentials (e.g. an MCP server). A PAT is an
-- opaque secret; only its SHA-256 hash is stored. It is exchanged at
-- POST /auth/token for a short-lived access JWT carrying a scope subset.
CREATE TABLE authentication.personal_access_tokens (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES authentication.users (id) ON DELETE CASCADE,
    name          text NOT NULL,
    token_hash    text NOT NULL UNIQUE,
    scopes        text[] NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_used_at  timestamptz,
    expires_at    timestamptz,
    revoked_at    timestamptz
);
CREATE INDEX pat_active_by_user_idx
    ON authentication.personal_access_tokens (user_id) WHERE revoked_at IS NULL;

-- Effective-dated tax residence of a user. Controls jurisdiction-specific
-- labels/disclosures only; the tracker never calculates local tax from it.
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
CREATE UNIQUE INDEX authentication_tax_residencies_current_primary_idx
    ON authentication.tax_residencies (user_id)
    WHERE valid_until IS NULL AND is_primary;

CREATE TABLE authentication.outbox_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type              text NOT NULL,
    event_version           integer NOT NULL CHECK (event_version > 0),
    aggregate_type          text NOT NULL,
    aggregate_id            uuid NOT NULL,
    aggregate_version       bigint NOT NULL CHECK (aggregate_version > 0),
    payload                 jsonb NOT NULL,
    correlation_id          text,
    causation_id            text,
    occurred_at             timestamptz NOT NULL DEFAULT now(),
    published_at            timestamptz,
    attempts                integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error              text
);
CREATE INDEX authentication_outbox_pending_idx
    ON authentication.outbox_events (occurred_at)
    WHERE published_at IS NULL;

-- =============================================================================
-- Instruments service
-- =============================================================================

CREATE TABLE instruments.currencies (
    code                    char(3) PRIMARY KEY,
    name                    text NOT NULL,
    symbol                  text,
    minor_unit              smallint NOT NULL DEFAULT 2
                            CHECK (minor_unit BETWEEN 0 AND 8)
);

INSERT INTO instruments.currencies (code, name, symbol, minor_unit) VALUES
    ('EUR', 'Euro', 'EUR', 2),
    ('USD', 'US Dollar', '$', 2),
    ('GBP', 'British Pound', 'GBP', 2),
    ('CHF', 'Swiss Franc', 'CHF', 2),
    ('JPY', 'Japanese Yen', 'JPY', 0),
    ('CAD', 'Canadian Dollar', 'CAD', 2),
    ('AUD', 'Australian Dollar', 'AUD', 2),
    ('HKD', 'Hong Kong Dollar', 'HKD', 2),
    ('SEK', 'Swedish Krona', 'SEK', 2),
    ('DKK', 'Danish Krone', 'DKK', 2),
    ('NOK', 'Norwegian Krone', 'NOK', 2),
    ('SGD', 'Singapore Dollar', 'SGD', 2),
    ('CNY', 'Chinese Renminbi', 'CNY', 2);

CREATE TABLE instruments.exchanges (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mic                     text NOT NULL UNIQUE,
    name                    text NOT NULL,
    timezone                text NOT NULL,
    regular_open_local      time,
    regular_close_local     time,
    holiday_calendar       jsonb NOT NULL DEFAULT '[]'::jsonb,
    active                  boolean NOT NULL DEFAULT true,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

-- `index` is a non-holdable asset type (benchmark series); the portfolio service
-- rejects opening a position on an index listing.
CREATE TABLE instruments.instruments (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    text NOT NULL,
    asset_type              text NOT NULL
                            CHECK (asset_type IN ('equity', 'fund', 'crypto', 'index')),
    isin                    text,
    primary_listing_id      uuid,
    active                  boolean NOT NULL DEFAULT true,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX instruments_isin_uq
    ON instruments.instruments (isin) WHERE isin IS NOT NULL;

CREATE TABLE instruments.listings (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_id           uuid NOT NULL
                            REFERENCES instruments.instruments(id) ON DELETE CASCADE,
    exchange_id             uuid
                            REFERENCES instruments.exchanges(id),
    symbol                  text NOT NULL,
    currency                char(3) NOT NULL
                            REFERENCES instruments.currencies(code),
    active                  boolean NOT NULL DEFAULT true,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX instruments_listings_symbol_exchange_uq
    ON instruments.listings (symbol, exchange_id);
CREATE INDEX instruments_listings_instrument_idx
    ON instruments.listings (instrument_id);

ALTER TABLE instruments.instruments
    ADD CONSTRAINT instruments_primary_listing_fk
    FOREIGN KEY (primary_listing_id) REFERENCES instruments.listings(id);

CREATE TABLE instruments.listing_provider_identifiers (
    listing_id              uuid NOT NULL
                            REFERENCES instruments.listings(id) ON DELETE CASCADE,
    provider                text NOT NULL,
    provider_identifier     text NOT NULL,
    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (listing_id, provider),
    UNIQUE (provider, provider_identifier)
);

-- Curated benchmark catalog: stable key -> seeded index listing.
CREATE TABLE instruments.benchmark_catalog (
    key          text PRIMARY KEY,
    name         text NOT NULL,
    listing_id   uuid NOT NULL REFERENCES instruments.listings(id) ON DELETE RESTRICT,
    region       text,
    sort_order   integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- Which provider serves each per-instrument data-retrieval capability. References
-- a provider by name only (its settings live in providers.provider_settings).
CREATE TABLE instruments.provider_selection (
    instrument_id uuid NOT NULL REFERENCES instruments.instruments(id) ON DELETE CASCADE,
    capability    text NOT NULL CHECK (capability IN (
                      'quotes', 'chart', 'analyst', 'fundamentals',
                      'earnings', 'corporate_actions', 'news')),
    provider      text NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (instrument_id, capability)
);
CREATE INDEX instruments_provider_selection_capability_idx
    ON instruments.provider_selection (capability, provider);

CREATE TABLE instruments.outbox_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type              text NOT NULL,
    event_version           integer NOT NULL CHECK (event_version > 0),
    aggregate_type          text NOT NULL,
    aggregate_id            uuid NOT NULL,
    aggregate_version       bigint NOT NULL CHECK (aggregate_version > 0),
    payload                 jsonb NOT NULL,
    correlation_id          text,
    causation_id            text,
    occurred_at             timestamptz NOT NULL DEFAULT now(),
    published_at            timestamptz,
    attempts                integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error              text
);
CREATE INDEX instruments_outbox_pending_idx
    ON instruments.outbox_events (occurred_at) WHERE published_at IS NULL;

-- Seed the four benchmark index instruments + listings (no exchange — index
-- series, not tradable venues), Yahoo provider mappings, and catalog entries.
INSERT INTO instruments.instruments (id, name, asset_type, active) VALUES
    ('b1000000-0000-4000-8000-000000000001', 'MSCI World Index',  'index', true),
    ('b1000000-0000-4000-8000-000000000002', 'S&P 500 Index',     'index', true),
    ('b1000000-0000-4000-8000-000000000003', 'NASDAQ-100 Index',  'index', true),
    ('b1000000-0000-4000-8000-000000000004', 'DAX Index',         'index', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO instruments.listings (id, instrument_id, exchange_id, symbol, currency, active) VALUES
    ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', NULL, '^990100-USD-STRD', 'USD', true),
    ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', NULL, '^GSPC',  'USD', true),
    ('b2000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000003', NULL, '^NDX',   'USD', true),
    ('b2000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000004', NULL, '^GDAXI', 'EUR', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO instruments.listing_provider_identifiers (listing_id, provider, provider_identifier) VALUES
    ('b2000000-0000-4000-8000-000000000001', 'yahoo', '^990100-USD-STRD'),
    ('b2000000-0000-4000-8000-000000000002', 'yahoo', '^GSPC'),
    ('b2000000-0000-4000-8000-000000000003', 'yahoo', '^NDX'),
    ('b2000000-0000-4000-8000-000000000004', 'yahoo', '^GDAXI')
ON CONFLICT (listing_id, provider) DO NOTHING;

INSERT INTO instruments.benchmark_catalog (key, name, listing_id, region, sort_order) VALUES
    ('msci_world', 'MSCI World', 'b2000000-0000-4000-8000-000000000001', 'global', 1),
    ('sp500',      'S&P 500',    'b2000000-0000-4000-8000-000000000002', 'us',     2),
    ('nasdaq100',  'NASDAQ-100', 'b2000000-0000-4000-8000-000000000003', 'us',     3),
    ('dax',        'DAX',        'b2000000-0000-4000-8000-000000000004', 'de',     4)
ON CONFLICT (key) DO NOTHING;

-- Every instrument is served by Yahoo for all selectable capabilities by default.
INSERT INTO instruments.provider_selection (instrument_id, capability, provider)
SELECT i.id, c.capability, 'yahoo'
FROM instruments.instruments i
CROSS JOIN (VALUES
    ('quotes'), ('chart'), ('analyst'), ('fundamentals'),
    ('earnings'), ('corporate_actions'), ('news')
) AS c(capability)
ON CONFLICT (instrument_id, capability) DO NOTHING;

-- =============================================================================
-- Portfolio service
-- =============================================================================

CREATE TABLE portfolio.portfolios (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL, -- external authentication user ID
    name                    text NOT NULL,
    sort_order              integer NOT NULL DEFAULT 0,
    archived_at             timestamptz,
    preferred_headline_metric text NOT NULL DEFAULT 'total_return',
    preferred_benchmark     jsonb,
    tax_rule_key            text,
    tax_settings            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);
CREATE INDEX portfolio_portfolios_user_order_idx
    ON portfolio.portfolios (user_id, sort_order, created_at);

CREATE TABLE portfolio.positions (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id            uuid NOT NULL
                            REFERENCES portfolio.portfolios(id) ON DELETE CASCADE,
    listing_id              uuid NOT NULL, -- external instruments listing ID
    state                   text NOT NULL DEFAULT 'open'
                            CHECK (state IN ('open', 'closed', 'invalid')),
    calculation_version     bigint NOT NULL DEFAULT 0 CHECK (calculation_version >= 0),
    last_valid_calculated_values jsonb NOT NULL DEFAULT '{}'::jsonb,
    invalid_reason          jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (portfolio_id, listing_id)
);
CREATE INDEX portfolio_positions_listing_idx ON portfolio.positions (listing_id);

CREATE TABLE portfolio.transactions (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    position_id             uuid NOT NULL
                            REFERENCES portfolio.positions(id) ON DELETE CASCADE,
    side                    text NOT NULL CHECK (side IN ('buy', 'sell')),
    effective_at            timestamptz NOT NULL,
    creation_sequence       bigint GENERATED ALWAYS AS IDENTITY,
    quantity                numeric(38, 12) NOT NULL CHECK (quantity > 0),
    price                   numeric(38, 12) NOT NULL CHECK (price >= 0),
    fee                     numeric(38, 12) NOT NULL DEFAULT 0 CHECK (fee >= 0),
    currency                char(3) NOT NULL,
    booking_fx_rate         numeric(38, 18) CHECK (booking_fx_rate > 0),
    tax_relevant_value_date date NOT NULL,
    savings_plan            boolean NOT NULL DEFAULT false,
    source                  text NOT NULL DEFAULT 'manual'
                            CHECK (source IN ('manual', 'import', 'broker_api', 'provider', 'corporate_action')),
    note                    text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (position_id, creation_sequence)
);
CREATE INDEX portfolio_transactions_ledger_idx
    ON portfolio.transactions (position_id, effective_at, creation_sequence);

CREATE TABLE portfolio.position_transfers (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    position_id             uuid NOT NULL
                            REFERENCES portfolio.positions(id) ON DELETE CASCADE,
    source_portfolio_id     uuid NOT NULL
                            REFERENCES portfolio.portfolios(id) ON DELETE CASCADE,
    destination_portfolio_id uuid NOT NULL
                            REFERENCES portfolio.portfolios(id) ON DELETE CASCADE,
    effective_at            timestamptz NOT NULL,
    creation_sequence       bigint GENERATED ALWAYS AS IDENTITY,
    kind                    text NOT NULL DEFAULT 'whole'
                            CHECK (kind IN ('whole', 'partial')),
    destination_position_id uuid
                            REFERENCES portfolio.positions(id) ON DELETE SET NULL,
    transferred_quantity    numeric(38, 12)
                            CHECK (transferred_quantity IS NULL OR transferred_quantity > 0),
    created_at              timestamptz NOT NULL DEFAULT now(),
    CHECK (source_portfolio_id <> destination_portfolio_id)
);
CREATE INDEX portfolio_position_transfers_position_idx
    ON portfolio.position_transfers (position_id, effective_at, creation_sequence);

CREATE TABLE portfolio.realization_allocations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sell_transaction_id     uuid NOT NULL
                            REFERENCES portfolio.transactions(id) ON DELETE CASCADE,
    buy_transaction_id      uuid NOT NULL
                            REFERENCES portfolio.transactions(id) ON DELETE CASCADE,
    quantity                numeric(38, 12) NOT NULL CHECK (quantity > 0),
    accounting_method       text NOT NULL CHECK (accounting_method IN ('fifo', 'lifo')),
    calculation_version     bigint NOT NULL CHECK (calculation_version > 0),
    created_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sell_transaction_id, buy_transaction_id, calculation_version)
);

CREATE TABLE portfolio.average_cost_realizations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sell_transaction_id     uuid NOT NULL
                            REFERENCES portfolio.transactions(id) ON DELETE CASCADE,
    average_cost_basis      numeric(38, 12) NOT NULL CHECK (average_cost_basis >= 0),
    quantity                numeric(38, 12) NOT NULL CHECK (quantity > 0),
    calculation_version     bigint NOT NULL CHECK (calculation_version > 0),
    created_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sell_transaction_id, calculation_version)
);

CREATE TABLE portfolio.position_corporate_action_applications (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    position_id             uuid NOT NULL
                            REFERENCES portfolio.positions(id) ON DELETE CASCADE,
    corporate_action_id     uuid NOT NULL, -- external events action ID
    corporate_action_version integer NOT NULL CHECK (corporate_action_version > 0),
    signed_action_snapshot  jsonb NOT NULL,
    token_signature_hash    text NOT NULL,
    ratio_numerator         numeric(38, 12) CHECK (ratio_numerator > 0),
    ratio_denominator       numeric(38, 12) CHECK (ratio_denominator > 0),
    effective_at            timestamptz NOT NULL,
    creation_sequence       bigint GENERATED ALWAYS AS IDENTITY,
    fractional_handling     text NOT NULL DEFAULT 'keep_fractional'
                            CHECK (fractional_handling IN
                                   ('keep_fractional', 'cash_settlement')),
    applied_by              uuid NOT NULL, -- external authentication user ID
    applied_at              timestamptz NOT NULL DEFAULT now(),
    reversed_at             timestamptz,
    reversed_by             uuid,
    reversal_reason         text
);
CREATE UNIQUE INDEX portfolio_active_corporate_action_application_uq
    ON portfolio.position_corporate_action_applications
       (position_id, corporate_action_id)
    WHERE reversed_at IS NULL;
CREATE INDEX portfolio_corporate_action_ledger_idx
    ON portfolio.position_corporate_action_applications
       (position_id, effective_at, creation_sequence);

CREATE TABLE portfolio.cash_flows (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL, -- external authentication user ID
    portfolio_id            uuid NOT NULL
                            REFERENCES portfolio.portfolios(id) ON DELETE CASCADE,
    position_id             uuid
                            REFERENCES portfolio.positions(id) ON DELETE CASCADE,
    corporate_action_id     uuid,
    corporate_action_application_id uuid
                            REFERENCES portfolio.position_corporate_action_applications(id)
                            ON DELETE SET NULL,
    type                    text NOT NULL CHECK (type IN
                            ('dividend', 'deposit', 'withdrawal', 'cash_in_lieu')),
    gross_amount            numeric(38, 12) NOT NULL,
    withholding_tax         numeric(38, 12) NOT NULL DEFAULT 0
                            CHECK (withholding_tax >= 0),
    fee                     numeric(38, 12) NOT NULL DEFAULT 0 CHECK (fee >= 0),
    net_amount              numeric(38, 12) NOT NULL,
    currency                char(3) NOT NULL,
    payment_date            date NOT NULL,
    tax_relevant_value_date date NOT NULL,
    source                  text NOT NULL DEFAULT 'manual'
                            CHECK (source IN ('manual', 'import', 'broker_api', 'provider', 'corporate_action')),
    note                    text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (type IN ('dividend', 'cash_in_lieu') AND position_id IS NOT NULL)
        OR (type IN ('deposit', 'withdrawal') AND position_id IS NULL)
    )
);
CREATE INDEX portfolio_cash_flows_portfolio_date_idx
    ON portfolio.cash_flows (portfolio_id, tax_relevant_value_date);

-- The actual tax withheld/refunded as booked by the broker. The broker is the
-- source of truth; the tracker records what happened and derives after-tax views.
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
    transaction_id     uuid REFERENCES portfolio.transactions(id) ON DELETE SET NULL,
    cash_flow_id       uuid REFERENCES portfolio.cash_flows(id) ON DELETE SET NULL,
    position_id        uuid REFERENCES portfolio.positions(id) ON DELETE SET NULL,
    portfolio_id       uuid REFERENCES portfolio.portfolios(id) ON DELETE CASCADE,
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

-- Immutable, append-only audit log of every create/update/delete to a booking.
-- No foreign keys: the history survives deletion of the row it describes.
CREATE TABLE portfolio.booking_changes (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL,             -- external authentication user ID
    entity_type   text NOT NULL CHECK (entity_type IN ('transaction', 'cash_flow', 'tax_event')),
    entity_id     uuid NOT NULL,             -- no FK: history outlives the entity
    action        text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
    source        text NOT NULL DEFAULT 'manual' CHECK (source IN
                  ('manual', 'import', 'broker_api', 'provider', 'corporate_action')),
    reason        text,
    before        jsonb,
    after         jsonb,
    portfolio_id  uuid,
    position_id   uuid,
    changed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_booking_changes_entity_idx
    ON portfolio.booking_changes (entity_type, entity_id, changed_at);
CREATE INDEX portfolio_booking_changes_user_idx
    ON portfolio.booking_changes (user_id, changed_at DESC);
CREATE INDEX portfolio_booking_changes_portfolio_idx
    ON portfolio.booking_changes (portfolio_id, changed_at DESC) WHERE portfolio_id IS NOT NULL;

-- Country-aware tax rules registry. Rule definitions/schemas/parameters are
-- DB-backed and versioned; the tax math stays in code (calculation_engine_key).
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

-- Seed: Germany (final settings schemas — taxCurrency removed, user schema v2).
INSERT INTO portfolio.tax_rules
    (country_code, rule_key, rule_version, asset_classes, valid_from,
     user_settings_schema, portfolio_settings_schema, parameters, calculation_engine_key)
VALUES (
    'DE', 'de_securities_tax', 1, ARRAY['equity'], '2009-01-01',
    '{"schemaKey":"de_user_tax_settings","version":2,"fields":[
        {"key":"churchTaxEnabled","label":"Church tax","type":"checkbox","default":false,"order":1,"helpText":"Enable if your broker withholds church tax (Kirchensteuer) for you."},
        {"key":"churchTaxRate","label":"Church tax rate","type":"select","required":true,"order":2,"visibleWhen":[{"field":"churchTaxEnabled","equals":true}],"options":[{"value":"0.08","label":"8% (Bavaria, Baden-Wuerttemberg)"},{"value":"0.09","label":"9% (other states)"}]}
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

INSERT INTO portfolio.tax_rules
    (country_code, rule_key, rule_version, asset_classes, valid_from,
     user_settings_schema, portfolio_settings_schema, parameters, calculation_engine_key)
VALUES (
    'DE', 'de_crypto_private_disposal', 1, ARRAY['crypto'], '2009-01-01',
    '{"schemaKey":"de_user_tax_settings","version":2,"fields":[
        {"key":"churchTaxEnabled","label":"Church tax","type":"checkbox","default":false,"order":1,"helpText":"Enable if your broker withholds church tax (Kirchensteuer) for you."},
        {"key":"churchTaxRate","label":"Church tax rate","type":"select","required":true,"order":2,"visibleWhen":[{"field":"churchTaxEnabled","equals":true}],"options":[{"value":"0.08","label":"8% (Bavaria, Baden-Wuerttemberg)"},{"value":"0.09","label":"9% (other states)"}]}
    ]}'::jsonb,
    '{"schemaKey":"de_crypto_portfolio_tax_settings","version":1,"fields":[
        {"key":"automaticTaxWithholding","label":"Automatic tax withholding","type":"checkbox","default":false,"order":1,"helpText":"Crypto private disposals are not subject to automatic German capital gains withholding. Usually off."},
        {"key":"taxReportingMode","label":"Tax reporting mode","type":"select","default":"taxableGainOnly","order":2,"options":[{"value":"taxableGainOnly","label":"Taxable gain only"}]}
    ]}'::jsonb,
    '{"holdingPeriodMonths":12,"taxFreeLimit":1000,"taxFreeLimitCurrency":"EUR"}'::jsonb,
    'germanCryptoTaxableGainOnly'
);

-- Saved tax settings values (validated against the schemas in portfolio.tax_rules).
CREATE TABLE portfolio.user_tax_settings (
    user_id       uuid PRIMARY KEY,             -- external authentication user ID
    country_code  char(2) NOT NULL,             -- ISO 3166-1 alpha-2 (the residence)
    settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE portfolio.watchlist_items (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL, -- external authentication user ID
    listing_id              uuid NOT NULL, -- external instruments listing ID
    note                    text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, listing_id)
);

CREATE TABLE portfolio.idempotency_keys (
    user_id                 uuid NOT NULL,
    operation               text NOT NULL,
    idempotency_key         text NOT NULL,
    request_hash            text NOT NULL,
    response_status         integer,
    response_body           jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    expires_at              timestamptz NOT NULL,
    PRIMARY KEY (user_id, operation, idempotency_key)
);

CREATE TABLE portfolio.outbox_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type              text NOT NULL,
    event_version           integer NOT NULL CHECK (event_version > 0),
    aggregate_type          text NOT NULL,
    aggregate_id            uuid NOT NULL,
    aggregate_version       bigint NOT NULL CHECK (aggregate_version > 0),
    user_id                 uuid,
    payload                 jsonb NOT NULL,
    correlation_id          text,
    causation_id            text,
    occurred_at             timestamptz NOT NULL DEFAULT now(),
    published_at            timestamptz,
    attempts                integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error              text
);
CREATE INDEX portfolio_outbox_pending_idx
    ON portfolio.outbox_events (occurred_at) WHERE published_at IS NULL;

-- =============================================================================
-- Market service
-- =============================================================================

CREATE TABLE market.price_quotes (
    listing_id              uuid NOT NULL, -- external instruments listing ID
    time                    timestamptz NOT NULL,
    provider                text NOT NULL,
    price                   numeric(38, 12) NOT NULL CHECK (price >= 0),
    volume                  numeric,
    currency                char(3) NOT NULL,
    provider_timestamp      timestamptz,
    retrieved_at            timestamptz NOT NULL DEFAULT now(),
    freshness_status        text NOT NULL DEFAULT 'fresh'
                            CHECK (freshness_status IN ('fresh', 'stale', 'delayed')),
    PRIMARY KEY (listing_id, time, provider)
);
CREATE INDEX market_price_quotes_time_brin
    ON market.price_quotes USING brin (time);
CREATE INDEX market_price_quotes_latest_idx
    ON market.price_quotes (listing_id, time DESC);

CREATE TABLE market.manual_valuations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL, -- external authentication user ID
    listing_id              uuid NOT NULL, -- external instruments listing ID
    effective_at            timestamptz NOT NULL,
    price                   numeric(38, 12) NOT NULL CHECK (price >= 0),
    currency                char(3) NOT NULL,
    created_by              uuid NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, listing_id, effective_at)
);

CREATE TABLE market.fx_rates (
    base_currency           char(3) NOT NULL,
    quote_currency          char(3) NOT NULL,
    effective_date          date NOT NULL,
    rate                    numeric(38, 18) NOT NULL CHECK (rate > 0),
    provider                text NOT NULL,
    provider_timestamp      timestamptz,
    retrieved_at            timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (base_currency, quote_currency, effective_date, provider),
    CHECK (base_currency <> quote_currency)
);
CREATE INDEX market_fx_rates_lookup_idx
    ON market.fx_rates (base_currency, quote_currency, effective_date DESC);

CREATE TABLE market.data_refresh_state (
    listing_id              uuid NOT NULL,
    data_type               text NOT NULL,
    provider                text NOT NULL,
    last_refreshed_at       timestamptz,
    next_due_at             timestamptz,
    last_error              text,
    consecutive_failures    integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
    PRIMARY KEY (listing_id, data_type, provider)
);
CREATE INDEX market_data_refresh_due_idx ON market.data_refresh_state (next_due_at);

CREATE TABLE market.outbox_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type              text NOT NULL,
    event_version           integer NOT NULL CHECK (event_version > 0),
    aggregate_type          text NOT NULL,
    aggregate_id            uuid NOT NULL,
    aggregate_version       bigint NOT NULL CHECK (aggregate_version > 0),
    payload                 jsonb NOT NULL,
    correlation_id          text,
    causation_id            text,
    occurred_at             timestamptz NOT NULL DEFAULT now(),
    published_at            timestamptz,
    attempts                integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error              text
);
CREATE INDEX market_outbox_pending_idx
    ON market.outbox_events (occurred_at) WHERE published_at IS NULL;

-- =============================================================================
-- Fundamentals service
-- =============================================================================

CREATE TABLE fundamentals.fundamentals (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_id           uuid NOT NULL, -- external instruments instrument ID
    effective_date          date NOT NULL,
    provider                text NOT NULL,
    currency                text,
    provider_as_of          timestamptz,
    quality                 text,
    pe_ratio                numeric(38, 12),
    pb_ratio                numeric(38, 12),
    ps_ratio                numeric(38, 12),
    dividend_yield          numeric(38, 12),
    eps                     numeric(38, 12),
    market_cap              numeric,
    revenue                 numeric,
    revenue_growth          numeric(38, 12),
    earnings_growth         numeric(38, 12),
    shares_outstanding      numeric(38, 12),
    net_debt                numeric,
    raw_payload             jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (instrument_id, effective_date, provider)
);
CREATE INDEX fundamentals_instrument_date_idx
    ON fundamentals.fundamentals (instrument_id, effective_date DESC);

CREATE TABLE fundamentals.outbox_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type              text NOT NULL,
    event_version           integer NOT NULL CHECK (event_version > 0),
    aggregate_type          text NOT NULL,
    aggregate_id            uuid NOT NULL,
    aggregate_version       bigint NOT NULL CHECK (aggregate_version > 0),
    payload                 jsonb NOT NULL,
    correlation_id          text,
    causation_id            text,
    occurred_at             timestamptz NOT NULL DEFAULT now(),
    published_at            timestamptz,
    attempts                integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error              text
);
CREATE INDEX fundamentals_outbox_pending_idx
    ON fundamentals.outbox_events (occurred_at) WHERE published_at IS NULL;

-- =============================================================================
-- Events service
-- =============================================================================

CREATE TABLE events.earnings (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_id           uuid NOT NULL, -- external instruments instrument ID
    fiscal_year             integer NOT NULL,
    fiscal_quarter          smallint CHECK (fiscal_quarter BETWEEN 1 AND 4),
    period_end_date         date,
    report_date             date,
    eps_estimate            numeric(38, 12),
    eps_actual              numeric(38, 12),
    revenue_estimate        numeric,
    revenue_actual          numeric,
    surprise_pct            numeric(38, 12),
    provider                text NOT NULL,
    raw_payload             jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (instrument_id, fiscal_year, fiscal_quarter, provider)
);
CREATE INDEX events_earnings_instrument_idx
    ON events.earnings (instrument_id, fiscal_year DESC, fiscal_quarter DESC);
CREATE INDEX events_earnings_report_date_idx ON events.earnings (report_date);

CREATE TABLE events.corporate_actions (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stable_action_id        uuid NOT NULL,
    version                 integer NOT NULL CHECK (version > 0),
    instrument_id           uuid NOT NULL, -- external instruments instrument ID
    type                    text NOT NULL CHECK (type IN
                            ('split', 'reverse_split', 'dividend', 'buyback',
                             'spinoff', 'capital_increase')),
    ex_date                 date NOT NULL,
    record_date             date,
    payment_date            date,
    ratio_numerator         numeric(38, 12),
    ratio_denominator       numeric(38, 12),
    dividend_amount         numeric(38, 12),
    dividend_currency       char(3),
    new_shares              numeric(38, 12),
    subscription_price      numeric(38, 12),
    shares_before           numeric(38, 12),
    shares_after            numeric(38, 12),
    dilution_ratio          numeric(38, 12),
    provider                text NOT NULL,
    source_reference        text,
    raw_payload             jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (stable_action_id, version),
    CHECK (
        type NOT IN ('split', 'reverse_split')
        OR (ratio_numerator > 0 AND ratio_denominator > 0)
    )
);
CREATE INDEX events_corporate_actions_instrument_idx
    ON events.corporate_actions (instrument_id, ex_date DESC);

CREATE TABLE events.news (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_id           uuid,
    published_at            timestamptz NOT NULL,
    provider                text NOT NULL,
    headline                text NOT NULL,
    url                     text,
    sentiment               text CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    category                text,
    relevance               numeric,
    summary                 text,
    raw_payload             jsonb,
    created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_news_instrument_time_idx
    ON events.news (instrument_id, published_at DESC);

CREATE TABLE events.macro_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type                    text NOT NULL,
    occurs_at               timestamptz NOT NULL,
    region                  text,
    title                   text NOT NULL,
    description             text,
    provider                text NOT NULL,
    raw_payload             jsonb,
    created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_macro_events_time_idx ON events.macro_events (occurs_at DESC);

-- Per-instrument refresh-state row gates how often events re-fetches from the
-- provider (earnings/corporate-actions/news change slowly).
CREATE TABLE events.refresh_state (
    instrument_id           uuid PRIMARY KEY,
    last_refreshed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events.outbox_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type              text NOT NULL,
    event_version           integer NOT NULL CHECK (event_version > 0),
    aggregate_type          text NOT NULL,
    aggregate_id            uuid NOT NULL,
    aggregate_version       bigint NOT NULL CHECK (aggregate_version > 0),
    payload                 jsonb NOT NULL,
    correlation_id          text,
    causation_id            text,
    occurred_at             timestamptz NOT NULL DEFAULT now(),
    published_at            timestamptz,
    attempts                integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error              text
);
CREATE INDEX events_outbox_pending_idx
    ON events.outbox_events (occurred_at) WHERE published_at IS NULL;

-- =============================================================================
-- Insights service
-- =============================================================================

CREATE TABLE insights.fair_value_estimates (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_id           uuid NOT NULL, -- external instruments instrument ID
    user_id                 uuid, -- NULL for global analyst estimate
    method                  text NOT NULL CHECK (method IN ('dcf', 'analyst')),
    value                   numeric(38, 12) NOT NULL CHECK (value >= 0),
    currency                char(3) NOT NULL,
    assumptions             jsonb,
    effective_date          date NOT NULL,
    source                  text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CHECK (method <> 'dcf' OR user_id IS NOT NULL)
);
CREATE INDEX insights_fair_values_instrument_user_idx
    ON insights.fair_value_estimates (instrument_id, user_id, effective_date DESC);

CREATE TABLE insights.price_targets (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_id           uuid NOT NULL, -- external instruments instrument ID
    listing_id              uuid, -- optional external listing-specific target
    user_id                 uuid, -- NULL for global analyst/technical target
    horizon                 text NOT NULL CHECK (horizon IN ('short', 'medium', 'long')),
    source                  text NOT NULL CHECK (source IN ('own', 'analyst', 'technical')),
    zone_low                numeric(38, 12),
    zone_high               numeric(38, 12),
    currency                char(3) NOT NULL,
    effective_date          date NOT NULL DEFAULT current_date,
    note                    text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CHECK (zone_low IS NOT NULL OR zone_high IS NOT NULL),
    CHECK (zone_low IS NULL OR zone_high IS NULL OR zone_low <= zone_high),
    CHECK (source <> 'own' OR user_id IS NOT NULL)
);
CREATE INDEX insights_price_targets_instrument_user_idx
    ON insights.price_targets (instrument_id, user_id, horizon);

CREATE TABLE insights.outbox_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type              text NOT NULL,
    event_version           integer NOT NULL CHECK (event_version > 0),
    aggregate_type          text NOT NULL,
    aggregate_id            uuid NOT NULL,
    aggregate_version       bigint NOT NULL CHECK (aggregate_version > 0),
    user_id                 uuid,
    payload                 jsonb NOT NULL,
    correlation_id          text,
    causation_id            text,
    occurred_at             timestamptz NOT NULL DEFAULT now(),
    published_at            timestamptz,
    attempts                integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error              text
);
CREATE INDEX insights_outbox_pending_idx
    ON insights.outbox_events (occurred_at) WHERE published_at IS NULL;

-- =============================================================================
-- Notifications service
-- =============================================================================
-- Everything is an alert rule: the three "automatic" alerts are pre-seeded
-- default rules (scope all_holdings) a user can edit/disable/delete. The
-- notifications service consumes portfolio events into its own user_interests
-- projection, evaluates rules on a schedule, and writes deduped notifications.

CREATE TABLE notifications.alert_rules (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL,
    kind          text NOT NULL CHECK (kind IN
                  ('price_threshold', 'daily_move', 'earnings_lead', 'cost_basis_move', 'target_zone')),
    -- 'instrument' targets a specific instrument; 'all_holdings' applies to every
    -- held/watched listing.
    scope         text NOT NULL CHECK (scope IN ('instrument', 'all_holdings')),
    instrument_id uuid,
    listing_id    uuid,
    params        jsonb NOT NULL,
    label         text,
    enabled       boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (scope = 'all_holdings' OR instrument_id IS NOT NULL)
);
CREATE INDEX notifications_alert_rules_user_idx
    ON notifications.alert_rules (user_id) WHERE enabled;

CREATE TABLE notifications.notifications (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL,
    type          text NOT NULL CHECK (type IN
                  ('daily_move', 'earnings_upcoming', 'target_zone', 'price_threshold', 'cost_basis_move')),
    severity      text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    title         text NOT NULL,
    body          text,
    instrument_id uuid,
    listing_id    uuid,
    rule_id       uuid REFERENCES notifications.alert_rules(id) ON DELETE SET NULL,
    data          jsonb,
    read_at       timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON notifications.notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON notifications.notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX notifications_rule_id_idx ON notifications.notifications (rule_id) WHERE rule_id IS NOT NULL;

CREATE TABLE notifications.user_interests (
    interest_id       uuid PRIMARY KEY,
    user_id           uuid NOT NULL,
    listing_id        uuid NOT NULL,
    interest_type     text NOT NULL CHECK (interest_type IN ('position', 'watchlist')),
    active            boolean NOT NULL,
    aggregate_version bigint NOT NULL CHECK (aggregate_version > 0),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_active_interests_idx ON notifications.user_interests (user_id) WHERE active;

CREATE TABLE notifications.alert_state (
    user_id     uuid NOT NULL,
    listing_id  uuid NOT NULL,
    alert_type  text NOT NULL,
    dedupe_key  text NOT NULL,
    fired_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, listing_id, alert_type)
);

-- Per-user marker so default rules are seeded exactly once.
CREATE TABLE notifications.seeded_users (
    user_id   uuid PRIMARY KEY,
    seeded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications.outbox_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type              text NOT NULL,
    event_version           integer NOT NULL CHECK (event_version > 0),
    aggregate_type          text NOT NULL,
    aggregate_id            uuid NOT NULL,
    aggregate_version       bigint NOT NULL CHECK (aggregate_version > 0),
    payload                 jsonb NOT NULL,
    correlation_id          text,
    causation_id            text,
    occurred_at             timestamptz NOT NULL DEFAULT now(),
    published_at            timestamptz,
    attempts                integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error              text
);
CREATE INDEX notifications_outbox_pending_idx
    ON notifications.outbox_events (occurred_at) WHERE published_at IS NULL;

-- =============================================================================
-- Providers service — admin-editable provider settings + refresh cadence
-- =============================================================================

CREATE TABLE providers.provider_settings (
    provider            text PRIMARY KEY,
    enabled             boolean NOT NULL DEFAULT true,
    provider_class      text NOT NULL CHECK (provider_class IN ('symbol', 'reference')),
    data_quality        text NOT NULL DEFAULT 'unknown'
                        CHECK (data_quality IN ('high', 'medium', 'low', 'unknown')),
    capability_quality  jsonb NOT NULL DEFAULT '{}'::jsonb,
    max_batch_size      integer CHECK (max_batch_size IS NULL OR max_batch_size > 0),
    rate_limit_per_min  integer CHECK (rate_limit_per_min IS NULL OR rate_limit_per_min > 0),
    max_concurrency     integer NOT NULL DEFAULT 4 CHECK (max_concurrency > 0),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Seed the providers that exist in code. lstc ships DISABLED (opt-in via admin).
INSERT INTO providers.provider_settings
    (provider, enabled, provider_class, data_quality, capability_quality, max_batch_size, rate_limit_per_min, max_concurrency)
VALUES
    ('yahoo', true,  'symbol',    'medium',  '{}'::jsonb, 50,   NULL, 4),
    ('ecb',   true,  'reference', 'high',    '{}'::jsonb, NULL, NULL, 1),
    ('lstc',  false, 'symbol',    'unknown', '{}'::jsonb, NULL, NULL, 2)
ON CONFLICT (provider) DO NOTHING;

-- Per-(provider × capability) refresh cadence (freshness threshold + quote
-- intraday save resolution). Read live each heartbeat by the refreshers.
CREATE TABLE providers.provider_capability_refresh (
    provider            text NOT NULL,
    capability          text NOT NULL,
    refresh_interval_ms integer NOT NULL CHECK (refresh_interval_ms >= 1000),
    save_resolution_ms  integer CHECK (save_resolution_ms IS NULL OR save_resolution_ms >= 1000),
    enabled             boolean NOT NULL DEFAULT true,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, capability)
);

INSERT INTO providers.provider_capability_refresh
    (provider, capability, refresh_interval_ms, save_resolution_ms)
VALUES
    ('yahoo', 'quotes',       300000, 300000),
    ('yahoo', 'earnings',     3600000, NULL),
    ('yahoo', 'fundamentals', 3600000, NULL),
    ('yahoo', 'analyst',      3600000, NULL),
    ('lstc',  'quotes',       300000, 60000),
    ('ecb',   'fx',           86400000, NULL)
ON CONFLICT (provider, capability) DO NOTHING;

-- =============================================================================
-- Ownership and Timescale compatibility notes
-- =============================================================================
--
-- In scaled deployments, apply the relevant schema section to the owning
-- service database and remove the schema qualifier through that service's
-- configured search_path if desired.
--
-- No table outside market references market.price_quotes. Its primary key
-- includes the time column, preserving a straightforward later TimescaleDB
-- migration path.
