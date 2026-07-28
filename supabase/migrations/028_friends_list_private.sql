-- Friends list privacy: when true, only the owner can see their friends list
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS friends_list_private boolean NOT NULL DEFAULT false;
