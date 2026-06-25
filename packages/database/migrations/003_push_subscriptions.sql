-- =============================================================================
-- Notifications — Web Push subscriptions (desktop notifications)
-- =============================================================================
-- Stores each client's Web Push subscription (the browser PushManager endpoint +
-- its encryption keys) so the service can deliver fired notifications to the OS
-- desktop even when no tab is open. One row per (user, endpoint); a user may have
-- several (multiple browsers/devices). Expired endpoints (404/410 from the push
-- service) are deleted by the sender.
-- =============================================================================

CREATE TABLE notifications.push_subscriptions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL,
    endpoint         text NOT NULL,
    p256dh           text NOT NULL,
    auth             text NOT NULL,
    user_agent       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    last_success_at  timestamptz,
    UNIQUE (user_id, endpoint)
);
CREATE INDEX notifications_push_subscriptions_user_idx
    ON notifications.push_subscriptions (user_id);
