-- Event shares: in-app "send event to friend"
CREATE TABLE IF NOT EXISTS event_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sender_id, recipient_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_shares_recipient ON event_shares(recipient_id, created_at DESC);

-- RLS
ALTER TABLE event_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own event shares"
  ON event_shares FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can read event shares where they are sender or recipient"
  ON event_shares FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
