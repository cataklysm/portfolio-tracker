-- =============================================================================
-- Fundamentals service — refresh-interest projection
-- =============================================================================
-- The fundamentals service maintains its own consolidated interest projection
-- from portfolio events (mirroring market.refresh_interests), so it knows which
-- instruments are held/watched and refreshes their fundamentals in the
-- background. Per-listing (events carry listing_id); the cycle resolves listing
-- -> instrument and dedupes before fetching.

CREATE TABLE fundamentals.refresh_interests (
    interest_id             uuid PRIMARY KEY,
    listing_id              uuid NOT NULL,
    interest_type           text NOT NULL CHECK (interest_type IN ('position', 'watchlist')),
    active                  boolean NOT NULL,
    aggregate_version       bigint NOT NULL CHECK (aggregate_version > 0),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (listing_id, interest_type, interest_id)
);
CREATE INDEX fundamentals_active_refresh_interests_idx
    ON fundamentals.refresh_interests (listing_id) WHERE active;
