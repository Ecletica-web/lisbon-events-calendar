-- Chats and group chats
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  is_group BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id, created_at DESC);

-- RLS
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read chats they are member of"
  ON chats FOR SELECT USING (
    id IN (SELECT chat_id FROM chat_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert chats"
  ON chats FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update chats they are member of"
  ON chats FOR UPDATE USING (
    id IN (SELECT chat_id FROM chat_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can read chat_members for their chats"
  ON chat_members FOR SELECT USING (
    chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert chat_members"
  ON chat_members FOR INSERT WITH CHECK (auth.uid() = user_id OR chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can read messages in their chats"
  ON chat_messages FOR SELECT USING (
    chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert messages in their chats"
  ON chat_messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = auth.uid())
  );
