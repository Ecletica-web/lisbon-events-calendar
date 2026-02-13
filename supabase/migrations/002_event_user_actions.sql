-- Event user actions: going, interested, saved, reminder (and optional went later)
-- One row per user+event+action_type. Actions are independent.

CREATE TABLE IF NOT EXISTS event_user_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('going','interested','saved','reminder','went')),
  reminder_at TIMESTAMPTZ,
  reminder_hours_before INT DEFAULT 24,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, event_id, action_type)
);

CREATE INDEX idx_event_user_actions_user_type ON event_user_actions (user_id, action_type);
CREATE INDEX idx_event_user_actions_event_type ON event_user_actions (event_id, action_type);
CREATE INDEX idx_event_user_actions_user_event ON event_user_actions (user_id, event_id);

ALTER TABLE event_user_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own event actions" ON event_user_actions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own event action" ON event_user_actions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own event action" ON event_user_actions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own event action" ON event_user_actions
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can read for event counts (public aggregate data)
-- Counts are fetched server-side with service client; no extra policy needed.
