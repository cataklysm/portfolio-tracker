-- =============================================================================
-- Notifications — instrument-scoped rules only, opt-out "notify once", no defaults
-- =============================================================================
-- Three changes that together stop notification spam:
--
--  1. Remove global ("all_holdings") rules. They evaluated against every holding
--     and multiplied every re-fire across the whole portfolio. Rules are now
--     always instrument-scoped (instrument_id NOT NULL) and the `scope` concept
--     is dropped entirely.
--  2. Add `notify_once` (default true): a rule fires once and then disables
--     itself. Opt out per rule to keep a recurring alert. `remind_after_minutes`
--     (5..1440) turns a recurring rule into a "remind me later" cooldown: after
--     firing it stays quiet for that many minutes before it may fire again.
--  3. Drop default-rule seeding. New users no longer get pre-seeded rules; the
--     per-user seeding marker table is removed.
-- =============================================================================

-- 1. Delete the global rules and any orphaned dedup state.
DELETE FROM notifications.alert_rules WHERE scope = 'all_holdings';
DELETE FROM notifications.alert_state s
 WHERE s.alert_type LIKE 'rule:%'
   AND NOT EXISTS (
     SELECT 1 FROM notifications.alert_rules r WHERE 'rule:' || r.id = s.alert_type
   );

-- 2. Rules are always instrument-scoped: drop `scope` (its dependent CHECKs go
--    with it) and require an instrument.
ALTER TABLE notifications.alert_rules DROP COLUMN IF EXISTS scope;
ALTER TABLE notifications.alert_rules ALTER COLUMN instrument_id SET NOT NULL;

-- 3. Opt-out one-shot flag + "remind me later" cooldown.
ALTER TABLE notifications.alert_rules
    ADD COLUMN IF NOT EXISTS notify_once boolean NOT NULL DEFAULT true;
ALTER TABLE notifications.alert_rules
    ADD COLUMN IF NOT EXISTS remind_after_minutes integer
        CHECK (remind_after_minutes IS NULL OR (remind_after_minutes >= 5 AND remind_after_minutes <= 1440));

-- 4. Default-rule seeding removed; the marker table is no longer used.
DROP TABLE IF EXISTS notifications.seeded_users;
