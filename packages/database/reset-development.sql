-- reset-development.sql
--
-- Empties every dev-seeded table plus the runtime data that accumulates on top
-- of it (market quotes, FX, refresh state/interests, provider symbols, outbox
-- queues, sessions). Run this, then `pnpm db:seed:development` to rebuild a
-- clean state — without dropping/recreating the database or re-running
-- migrations. The schema (tables, indexes) is left untouched.
--
-- ⚠️ DEVELOPMENT ONLY. Irreversible: it deletes all rows in these tables.

BEGIN;

-- Application data: instruments, market, and portfolio. TRUNCATE ... CASCADE
-- clears intra-schema dependents and resets sequences in one shot.
TRUNCATE
    instruments.listing_provider_identifiers,
    instruments.listings,
    instruments.instruments,
    instruments.exchanges,
    instruments.watch_interests,
    instruments.outbox_events,

    market.price_quotes,
    market.fx_rates,
    market.data_refresh_state,
    market.manual_valuations,
    market.outbox_events,

    portfolio.transactions,
    portfolio.realization_allocations,
    portfolio.average_cost_realizations,
    portfolio.position_corporate_action_applications,
    portfolio.position_transfers,
    portfolio.cash_flows,
    portfolio.positions,
    portfolio.watchlist_items,
    portfolio.idempotency_keys,
    portfolio.outbox_events,
    portfolio.portfolios
RESTART IDENTITY CASCADE;

-- Authentication: users, credentials, preferences, sessions, instance config.
-- This logs you out — after re-seeding, log in again with the dev credentials.
-- Comment out this statement if you want to keep your current login/session.
TRUNCATE
    authentication.refresh_tokens,
    authentication.local_credentials,
    authentication.user_preferences,
    authentication.invitations,
    authentication.outbox_events,
    authentication.instance_config,
    authentication.users
RESTART IDENTITY CASCADE;

COMMIT;
