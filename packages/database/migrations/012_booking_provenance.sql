-- =============================================================================
-- Source provenance + append-only change history (Phase A-2)
-- =============================================================================
-- Financial bookings must explain where they came from and how they changed.
--
--  * `source` on transactions and cash flows (tax_events already has it) records
--    HOW a booking entered the system: manual entry, statement import, broker API,
--    provider feed, or a generated corporate action. Default 'manual'; non-manual
--    sources arrive with the import/broker tracks.
--
--  * `portfolio.booking_changes` is an immutable, append-only audit log of every
--    create/update/delete to a transaction, cash flow, or tax event — who changed
--    what, when, why, with before/after snapshots. It deliberately has NO foreign
--    keys to the entities, so the history survives the deletion of the row it
--    describes (that is the whole point of an audit trail).
-- =============================================================================

ALTER TABLE portfolio.transactions
    ADD COLUMN source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'import', 'broker_api', 'provider', 'corporate_action'));

ALTER TABLE portfolio.cash_flows
    ADD COLUMN source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'import', 'broker_api', 'provider', 'corporate_action'));

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
    -- Optional scoping for report drill-down / filtering.
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
