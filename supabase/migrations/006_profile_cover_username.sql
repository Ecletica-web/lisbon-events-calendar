-- Profile: cover image, unique username
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT;

-- Allow bio up to 200 chars
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_bio_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_bio_check
  CHECK (bio IS NULL OR (char_length(bio) >= 1 AND char_length(bio) <= 200));

-- Unique username (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username_lower
  ON user_profiles (LOWER(username)) WHERE username IS NOT NULL;

-- Allow public read of profiles (for profile pages, avatars)
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
CREATE POLICY "Profiles readable by all" ON user_profiles
  FOR SELECT USING (true);
