-- =============================================================================
-- Notifications - per-notification snooze
-- =============================================================================
-- "Remind me later" is a user action on a fired notification, not a rule
-- cadence. Snoozed notifications stay unread, are hidden from live delivery until
-- `snoozed_until`, and are re-emitted through the normal notifications.created
-- stream when due.
-- =============================================================================

ALTER TABLE notifications.notifications
    ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

CREATE INDEX IF NOT EXISTS notifications_snoozed_due_idx
    ON notifications.notifications (snoozed_until)
    WHERE read_at IS NULL AND snoozed_until IS NOT NULL;

ALTER TABLE notifications.alert_rules
    DROP COLUMN IF EXISTS remind_after_minutes;
