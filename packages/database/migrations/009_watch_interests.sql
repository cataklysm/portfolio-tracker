-- =============================================================================
-- Instruments service — canonical watch-interest projection (watch-set authority)
-- =============================================================================
-- Phase 1 of consolidating the per-service refresh-interest projections
-- (market/fundamentals/events each maintained an identical copy). The
-- instruments service becomes the single owner: it consumes the `portfolio`
-- stream into this projection, then serves the deduped, resolved watch set as a
-- snapshot (/internal/watch-set) and broadcasts deltas (instruments.watch.*) so
-- the other services can hold the set in memory instead of each keeping a table.
--
-- The instruments-watch consumer group is created at offset 0, so it replays the
-- existing portfolio backlog and populates this table on first start — no
-- explicit backfill needed.

CREATE TABLE instruments.watch_interests (
    interest_id       uuid PRIMARY KEY,
    listing_id        uuid NOT NULL,
    interest_type     text NOT NULL CHECK (interest_type IN ('position', 'watchlist')),
    active            boolean NOT NULL,
    aggregate_version bigint NOT NULL CHECK (aggregate_version > 0),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (listing_id, interest_type, interest_id)
);
CREATE INDEX instruments_active_watch_interests_idx
    ON instruments.watch_interests (listing_id) WHERE active;
