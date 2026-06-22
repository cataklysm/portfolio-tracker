-- Link fired notifications back to the alert rule that produced them.
-- Existing rows remain null because older notifications cannot be attributed
-- reliably after the fact.

ALTER TABLE notifications.notifications
  ADD COLUMN rule_id uuid REFERENCES notifications.alert_rules(id) ON DELETE SET NULL;

CREATE INDEX notifications_rule_id_idx
  ON notifications.notifications (rule_id)
  WHERE rule_id IS NOT NULL;
