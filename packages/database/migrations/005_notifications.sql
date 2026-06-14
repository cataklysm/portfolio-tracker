-- =============================================================================
-- Notifications service (v2) — user-visible alerts
-- =============================================================================
-- §2.7 threshold alerts: significant daily move, upcoming earnings, and price
-- reaching the user's own target zone. The service consumes portfolio events to
-- learn which listings each user holds/watches (user_interests), evaluates the
-- alert conditions on a schedule against data pulled from market/events/insights,
-- and writes deduped user-visible notifications. alert_state stores the last
-- fired signature per (user, listing, alert_type) so a standing condition does
-- not re-notify every cycle.

CREATE SCHEMA notifications;

CREATE TABLE notifications.notifications (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL,
    type          text NOT NULL CHECK (type IN ('daily_move', 'earnings_upcoming', 'target_zone')),
    severity      text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    title         text NOT NULL,
    body          text,
    instrument_id uuid,
    listing_id    uuid,
    data          jsonb,
    read_at       timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON notifications.notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON notifications.notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE notifications.user_interests (
    interest_id       uuid PRIMARY KEY,
    user_id           uuid NOT NULL,
    listing_id        uuid NOT NULL,
    interest_type     text NOT NULL CHECK (interest_type IN ('position', 'watchlist')),
    active            boolean NOT NULL,
    aggregate_version bigint NOT NULL CHECK (aggregate_version > 0),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_active_interests_idx ON notifications.user_interests (user_id) WHERE active;

CREATE TABLE notifications.alert_state (
    user_id     uuid NOT NULL,
    listing_id  uuid NOT NULL,
    alert_type  text NOT NULL,
    dedupe_key  text NOT NULL,
    fired_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, listing_id, alert_type)
);

CREATE TABLE notifications.outbox_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type              text NOT NULL,
    event_version           integer NOT NULL CHECK (event_version > 0),
    aggregate_type          text NOT NULL,
    aggregate_id            uuid NOT NULL,
    aggregate_version       bigint NOT NULL CHECK (aggregate_version > 0),
    payload                 jsonb NOT NULL,
    correlation_id          text,
    causation_id            text,
    occurred_at             timestamptz NOT NULL DEFAULT now(),
    published_at            timestamptz,
    attempts                integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error              text
);
CREATE INDEX notifications_outbox_pending_idx
    ON notifications.outbox_events (occurred_at) WHERE published_at IS NULL;
