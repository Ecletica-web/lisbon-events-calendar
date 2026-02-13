-- Backfill: copy existing wishlist into event_user_actions(saved)
-- Run after 002_event_user_actions.sql

INSERT INTO event_user_actions (user_id, event_id, action_type, created_at, updated_at)
SELECT user_id, event_id, 'saved', created_at, NOW()
FROM user_wishlist_events
ON CONFLICT (user_id, event_id, action_type) DO NOTHING;
