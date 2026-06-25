-- =============================================================================
-- Notifications — stable public handle for a push subscription
-- =============================================================================
-- A push subscription is deleted by sha256(endpoint) (a deterministic id the
-- client can compute) via DELETE /notifications/push/subscriptions/:id, so the
-- long, capability-like endpoint URL never appears in a request URL or logs.
-- The hash is written by the app on every upsert; the table is new so no
-- backfill is needed.
-- =============================================================================

ALTER TABLE notifications.push_subscriptions ADD COLUMN endpoint_hash text;
CREATE UNIQUE INDEX notifications_push_subscriptions_user_hash_uq
    ON notifications.push_subscriptions (user_id, endpoint_hash);
