-- Admin-deleted analyst price targets should stay deleted across provider refreshes.
-- One tombstone per instrument suppresses the global analyst target ingest.

CREATE TABLE insights.suppressed_analyst_price_targets (
    instrument_id           uuid PRIMARY KEY,
    deleted_by              uuid,
    deleted_at              timestamptz NOT NULL DEFAULT now()
);

