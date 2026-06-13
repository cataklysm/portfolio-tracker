-- =============================================================================
-- Events service — refresh projection + per-instrument refresh state
-- =============================================================================
-- Mirrors the fundamentals/market pattern: a consolidated interest projection
-- built from portfolio events tells the events service which instruments are
-- held/watched. A per-instrument refresh-state row gates how often it re-fetches
-- earnings/corporate-actions/news from the provider (these change slowly, so the
-- scheduler skips instruments refreshed within the configured window).

CREATE TABLE events.refresh_interests (
    interest_id             uuid PRIMARY KEY,
    listing_id              uuid NOT NULL,
    interest_type           text NOT NULL CHECK (interest_type IN ('position', 'watchlist')),
    active                  boolean NOT NULL,
    aggregate_version       bigint NOT NULL CHECK (aggregate_version > 0),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (listing_id, interest_type, interest_id)
);
CREATE INDEX events_active_refresh_interests_idx
    ON events.refresh_interests (listing_id) WHERE active;

CREATE TABLE events.refresh_state (
    instrument_id           uuid PRIMARY KEY,
    last_refreshed_at       timestamptz NOT NULL DEFAULT now()
);
