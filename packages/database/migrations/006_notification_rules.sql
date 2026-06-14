-- =============================================================================
-- Notifications service — user-defined alert rules + tunable default thresholds
-- =============================================================================
-- alert_rules holds user-created custom alerts (price threshold, custom daily
-- move %, earnings lead time, % from cost basis). preferences holds each user's
-- tunable thresholds for the three automatic (built-in) alerts. Both are
-- evaluated by the same scheduler; rule firings dedup through alert_state keyed
-- by alert_type = 'rule:<rule_id>'.

CREATE TABLE notifications.alert_rules (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL,
    kind          text NOT NULL CHECK (kind IN
                  ('price_threshold', 'daily_move', 'earnings_lead', 'cost_basis_move')),
    -- 'instrument' targets a specific instrument the user holds; 'all_holdings'
    -- applies to every held/watched listing.
    scope         text NOT NULL CHECK (scope IN ('instrument', 'all_holdings')),
    instrument_id uuid,
    listing_id    uuid,
    params        jsonb NOT NULL,
    label         text,
    enabled       boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (scope = 'all_holdings' OR instrument_id IS NOT NULL)
);
CREATE INDEX notifications_alert_rules_user_idx
    ON notifications.alert_rules (user_id) WHERE enabled;

-- Widen the notification type check to cover the new user-defined rule kinds
-- (the built-in alert dedup keys stay the original three types; rule firings use
-- alert_type = 'rule:<id>' in alert_state but still land in these notification
-- types). The auto-generated constraint name from migration 005 is
-- notifications_type_check.
ALTER TABLE notifications.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications.notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('daily_move', 'earnings_upcoming', 'target_zone', 'price_threshold', 'cost_basis_move'));

CREATE TABLE notifications.preferences (
    user_id             uuid PRIMARY KEY,
    daily_move_enabled  boolean NOT NULL DEFAULT true,
    daily_move_pct      numeric(38, 12) NOT NULL DEFAULT 5,
    earnings_enabled    boolean NOT NULL DEFAULT true,
    earnings_days       integer NOT NULL DEFAULT 7 CHECK (earnings_days > 0),
    target_zone_enabled boolean NOT NULL DEFAULT true,
    updated_at          timestamptz NOT NULL DEFAULT now()
);
