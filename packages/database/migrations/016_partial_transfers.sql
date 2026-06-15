-- =============================================================================
-- Partial-lot position transfers (Phase D-1 follow-up)
-- =============================================================================
-- The original position_transfers table recorded only whole-position moves: the
-- whole ledger was reassigned (or merged) and `position_id` pointed at the
-- surviving position. Partial-lot transfers move a subset of fully-open buy lots
-- to a same-listing position in another portfolio, so the SOURCE position
-- survives and a DIFFERENT position receives the lots. These columns let a
-- single table record both shapes:
--
--  * kind                    — 'whole' (legacy reassign/merge) or 'partial'.
--  * destination_position_id — the position the lots landed in (partial moves;
--                              also useful for whole merges). ON DELETE SET NULL
--                              so the transfer history outlives the position.
--  * transferred_quantity    — informational sum of moved (raw) lot quantities;
--                              null for whole moves (the whole ledger moved).
--
-- For partial transfers `position_id` is the SOURCE position (which survives);
-- for whole transfers it stays the surviving/merged-into position as before.
-- =============================================================================

ALTER TABLE portfolio.position_transfers
    ADD COLUMN kind text NOT NULL DEFAULT 'whole'
        CHECK (kind IN ('whole', 'partial')),
    ADD COLUMN destination_position_id uuid
        REFERENCES portfolio.positions(id) ON DELETE SET NULL,
    ADD COLUMN transferred_quantity numeric(38, 12)
        CHECK (transferred_quantity IS NULL OR transferred_quantity > 0);
