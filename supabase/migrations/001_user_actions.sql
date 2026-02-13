-- Lisbon Events Calendar: User actions tables + RLS
-- Run this in Supabase SQL Editor after creating your project

-- User profiles (optional; Supabase auth.users has id, email, etc.)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- user_follow_venues
CREATE TABLE IF NOT EXISTS user_follow_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, venue_id)
);

ALTER TABLE user_follow_venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own venue follows" ON user_follow_venues
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own venue follow" ON user_follow_venues
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own venue follow" ON user_follow_venues
  FOR DELETE USING (auth.uid() = user_id);

-- user_follow_promoters
CREATE TABLE IF NOT EXISTS user_follow_promoters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  promoter_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, promoter_id)
);

ALTER TABLE user_follow_promoters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own promoter follows" ON user_follow_promoters
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own promoter follow" ON user_follow_promoters
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own promoter follow" ON user_follow_promoters
  FOR DELETE USING (auth.uid() = user_id);

-- user_wishlist_events
CREATE TABLE IF NOT EXISTS user_wishlist_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, event_id)
);

ALTER TABLE user_wishlist_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own wishlist" ON user_wishlist_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wishlist item" ON user_wishlist_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own wishlist item" ON user_wishlist_events
  FOR DELETE USING (auth.uid() = user_id);

-- user_like_events
CREATE TABLE IF NOT EXISTS user_like_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, event_id)
);

ALTER TABLE user_like_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own likes" ON user_like_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own like" ON user_like_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own like" ON user_like_events
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger to create profile on signup (optional)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, user_profiles.name),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
