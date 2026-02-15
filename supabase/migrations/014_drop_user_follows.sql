-- Drop user-to-user follows table (removed: asymmetric followers/following).
-- Friends are now the only social relationship; see friend_requests (status=accepted).
-- Follow venues/promoters remain in user_follow_venues and user_follow_promoters.
DROP TABLE IF EXISTS follows;
