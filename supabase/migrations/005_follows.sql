-- User-to-user follows (asymmetric, Instagram-style)
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX idx_follows_following ON follows (following_id);
CREATE INDEX idx_follows_follower ON follows (follower_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read follows involving themselves" ON follows
  FOR SELECT USING (
    auth.uid() = follower_id OR auth.uid() = following_id
  );

CREATE POLICY "Users can insert own follow" ON follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can delete own follow" ON follows
  FOR DELETE USING (auth.uid() = follower_id);
