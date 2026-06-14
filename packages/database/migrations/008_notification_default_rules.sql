-- =============================================================================
-- Notifications service — everything-is-a-rule
-- =============================================================================
-- Collapses the built-in/automatic alerts and user-defined rules into a single
-- concept: alert rules. The three "automatic" alerts become pre-seeded default
-- rules (scope all_holdings) that a user can edit, disable, or delete like any
-- other rule. This drops the separate `preferences` table and adds `target_zone`
-- as a real rule kind so target-zone alerts are expressible as rules too.

-- 1. Allow target_zone as a rule kind. The inline CHECK from migration 006 is
--    auto-named alert_rules_kind_check.
ALTER TABLE notifications.alert_rules DROP CONSTRAINT alert_rules_kind_check;
ALTER TABLE notifications.alert_rules ADD CONSTRAINT alert_rules_kind_check
    CHECK (kind IN ('price_threshold', 'daily_move', 'earnings_lead', 'cost_basis_move', 'target_zone'));

-- 2. Per-user marker so default rules are seeded exactly once (the service also
--    claims this row atomically when it first sees a user via portfolio events).
CREATE TABLE notifications.seeded_users (
    user_id   uuid PRIMARY KEY,
    seeded_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Backfill: give every user we already know about the three default rules,
--    then mark them seeded so the service won't seed them again.
INSERT INTO notifications.alert_rules (user_id, kind, scope, params, label)
SELECT u.user_id, d.kind, 'all_holdings', d.params::jsonb, d.label
FROM (SELECT DISTINCT user_id FROM notifications.user_interests) AS u
CROSS JOIN (VALUES
    ('daily_move',    '{"threshold_pct": 5}', 'Significant daily move'),
    ('earnings_lead', '{"days": 7}',          'Upcoming earnings'),
    ('target_zone',   '{}',                   'Price target reached')
) AS d(kind, params, label);

INSERT INTO notifications.seeded_users (user_id)
SELECT DISTINCT user_id FROM notifications.user_interests
ON CONFLICT (user_id) DO NOTHING;

-- 4. Drop the now-redundant tunable-defaults table.
DROP TABLE notifications.preferences;
