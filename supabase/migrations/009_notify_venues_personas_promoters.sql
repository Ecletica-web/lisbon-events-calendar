-- Notification preferences: venues, personas, promoters (Supabase)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notify_venues BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_personas BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_promoters BOOLEAN DEFAULT false;
