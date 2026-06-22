-- The instrument identity is represented by ISIN where available, by listing
-- symbol/exchange for tradable listings, and by per-provider identifiers for
-- data-fetch symbols. `underlying_identifier` duplicated those concepts.

DROP INDEX IF EXISTS instruments.instruments_underlying_identifier_uq;

ALTER TABLE instruments.instruments
    DROP COLUMN IF EXISTS underlying_identifier;
