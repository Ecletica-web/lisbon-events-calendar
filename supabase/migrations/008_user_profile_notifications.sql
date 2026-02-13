-- Notification settings for user profiles (Supabase)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS digest_frequency TEXT DEFAULT 'weekly' CHECK (digest_frequency IN ('daily', 'weekly', 'never')),
  ADD COLUMN IF NOT EXISTS notification_timezone TEXT DEFAULT 'Europe/Lisbon';
