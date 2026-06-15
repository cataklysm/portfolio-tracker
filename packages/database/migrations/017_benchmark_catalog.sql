-- =============================================================================
-- Curated benchmark catalog + non-holdable index asset type (spec §2.2)
-- =============================================================================
-- Benchmarks are exposed through a curated catalog owned by the instruments
-- service. Each entry has a stable key and resolves directly to a seeded index
-- listing with provider mappings — runtime symbol lookup is avoided because
-- symbols are not globally unique and provider identifiers differ. The portfolio
-- service stores only the selected listing_id; the normal instrument/listing
-- search remains the fallback for benchmarks outside the curated set.
--
-- Index instruments are reference assets for benchmark series and CANNOT be held
-- as portfolio positions (the portfolio service rejects opening a position on an
-- index listing). A user who holds an index-tracking product picks the
-- corresponding fund/ETF listing instead.
--
-- Initial benchmarks: MSCI World, S&P 500, DAX, NASDAQ-100. The Yahoo provider
-- identifiers below must be verified at deployment time (Yahoo is an unofficial,
-- changeable integration); the search-picker fallback covers any that drift.
-- =============================================================================

-- 1. Allow the non-holdable `index` asset type.
ALTER TABLE instruments.instruments DROP CONSTRAINT IF EXISTS instruments_asset_type_check;
ALTER TABLE instruments.instruments
    ADD CONSTRAINT instruments_asset_type_check
    CHECK (asset_type IN ('equity', 'fund', 'crypto', 'index'));

-- 2. The curated catalog: stable key -> seeded index listing.
CREATE TABLE instruments.benchmark_catalog (
    key          text PRIMARY KEY,
    name         text NOT NULL,
    listing_id   uuid NOT NULL REFERENCES instruments.listings(id) ON DELETE RESTRICT,
    region       text,
    sort_order   integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- 3. Seed the four index instruments, their listings (no exchange — these are
--    index series, not tradable venues), Yahoo provider mappings, and catalog
--    entries. Fixed UUIDs keep the references stable and the seed self-contained.
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
