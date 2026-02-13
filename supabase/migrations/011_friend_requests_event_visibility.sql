-- Friend requests (mutual connection flow)
CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id != addressee_id)
);

CREATE INDEX idx_friend_requests_addressee ON friend_requests (addressee_id);
CREATE INDEX idx_friend_requests_requester ON friend_requests (requester_id);
CREATE INDEX idx_friend_requests_status ON friend_requests (status);

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read friend requests involving themselves" ON friend_requests
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Users can insert own friend request" ON friend_requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Addressee can update to accept/reject" ON friend_requests
  FOR UPDATE USING (auth.uid() = addressee_id);

CREATE POLICY "Requester can delete own pending request" ON friend_requests
  FOR DELETE USING (auth.uid() = requester_id);

-- Event visibility (who can see my Going/Saved/Liked events)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS event_visibility TEXT NOT NULL DEFAULT 'public' CHECK (event_visibility IN ('public', 'friends_only'));
