-- Unified user interactions (one table for all signals)
CREATE TABLE IF NOT EXISTS user_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('event','venue','promoter')),
  entity_id TEXT NOT NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    'like','save','going','interested','follow_venue','follow_promoter','reminder'
  )),
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, entity_type, entity_id, interaction_type)
);

CREATE INDEX idx_user_interactions_user ON user_interactions (user_id);
CREATE INDEX idx_user_interactions_entity ON user_interactions (entity_type, entity_id);
CREATE INDEX idx_user_interactions_type ON user_interactions (user_id, interaction_type);

ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own interactions" ON user_interactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own interaction" ON user_interactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own interaction" ON user_interactions
  FOR DELETE USING (auth.uid() = user_id);

-- Activity log (data moat; no RLS so only server writes)
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_user_time ON user_activity_logs (user_id, created_at DESC);
CREATE INDEX idx_activity_logs_action ON user_activity_logs (action_type, created_at DESC);

ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own activity" ON user_activity_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Backfill from existing tables
INSERT INTO user_interactions (user_id, entity_type, entity_id, interaction_type, created_at)
SELECT user_id, 'venue', venue_id, 'follow_venue', created_at
FROM user_follow_venues
ON CONFLICT (user_id, entity_type, entity_id, interaction_type) DO NOTHING;

INSERT INTO user_interactions (user_id, entity_type, entity_id, interaction_type, created_at)
SELECT user_id, 'promoter', promoter_id, 'follow_promoter', created_at
FROM user_follow_promoters
ON CONFLICT (user_id, entity_type, entity_id, interaction_type) DO NOTHING;

INSERT INTO user_interactions (user_id, entity_type, entity_id, interaction_type, created_at)
SELECT user_id, 'event', event_id, 'like', created_at
FROM user_like_events
ON CONFLICT (user_id, entity_type, entity_id, interaction_type) DO NOTHING;

INSERT INTO user_interactions (user_id, entity_type, entity_id, interaction_type, metadata_json, created_at)
SELECT user_id, 'event', event_id, 
  CASE action_type WHEN 'saved' THEN 'save' ELSE action_type END,
  CASE WHEN action_type = 'reminder' AND reminder_hours_before IS NOT NULL 
    THEN jsonb_build_object('reminder_hours_before', reminder_hours_before) ELSE '{}' END,
  created_at
FROM event_user_actions
WHERE action_type IN ('going','interested','saved','reminder')
ON CONFLICT (user_id, entity_type, entity_id, interaction_type) DO NOTHING;
