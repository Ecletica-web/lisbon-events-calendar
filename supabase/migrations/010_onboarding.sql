-- Onboarding preferences for user profiles (Supabase)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_intent TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_tags JSONB,
  ADD COLUMN IF NOT EXISTS onboarding_vibe TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_free_only BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_english_friendly BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_accessible BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_avoid_sold_out BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_near_me BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS onboarding_lng DOUBLE PRECISION;
