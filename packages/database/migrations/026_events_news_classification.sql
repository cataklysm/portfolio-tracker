-- =============================================================================
-- Events service — news classification (category + relevance)
-- =============================================================================
-- The asset-detail news section needs more than a flat headline list: a category
-- to group by (Earnings / Analyst / Regulation / Macro / Company News) and a
-- relevance score to rank and trim. Yahoo supplies no authoritative taxonomy, so
-- these are derived heuristically from the headline at ingest time (see
-- events/feed/domain/mapping.ts). `sentiment` already exists; it is now populated
-- by the same heuristic. All nullable so historical rows and low-signal items
-- simply carry null.
-- =============================================================================

ALTER TABLE events.news ADD COLUMN category text;
ALTER TABLE events.news ADD COLUMN relevance numeric;
