-- Lisbon Events Calendar — full schema for a NEW Supabase project
-- Project: https://fytnwjhlinmusfrxtxaz.supabase.co
-- Paste this entire file into Supabase → SQL Editor → Run
-- Generated from migrations 001–019


-- ============================================================
-- 001_user_actions.sql
-- ============================================================
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

-- Public profiles readable by anyone (for profile pages, avatars, etc.)
CREATE POLICY "Public profiles are readable by all" ON user_profiles
  FOR SELECT USING (true);

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


-- ============================================================
-- 002_event_user_actions.sql
-- ============================================================
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


-- ============================================================
-- 003_user_profiles_extend.sql
-- ============================================================
-- Extend user_profiles with display_name, avatar_url, bio, location, social_link, private_mode

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT CHECK (bio IS NULL OR char_length(bio) <= 160),
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS social_link TEXT,
  ADD COLUMN IF NOT EXISTS private_mode BOOLEAN DEFAULT false;


-- ============================================================
-- 004_wishlist_to_event_actions.sql
-- ============================================================
-- Backfill: copy existing wishlist into event_user_actions(saved)
-- Run after 002_event_user_actions.sql

INSERT INTO event_user_actions (user_id, event_id, action_type, created_at, updated_at)
SELECT user_id, event_id, 'saved', created_at, NOW()
FROM user_wishlist_events
ON CONFLICT (user_id, event_id, action_type) DO NOTHING;


-- ============================================================
-- 005_follows.sql
-- ============================================================
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


-- ============================================================
-- 006_profile_cover_username.sql
-- ============================================================
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


-- ============================================================
-- 007_profile_storage_bucket.sql
-- ============================================================
-- Storage bucket for profile images (avatars + covers)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-images',
  'profile-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own profile images
DROP POLICY IF EXISTS "Users can upload own profile images" ON storage.objects;
CREATE POLICY "Users can upload own profile images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read
DROP POLICY IF EXISTS "Profile images are public" ON storage.objects;
CREATE POLICY "Profile images are public"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-images');


-- ============================================================
-- 008_user_profile_notifications.sql
-- ============================================================
-- Notification settings for user profiles (Supabase)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS digest_frequency TEXT DEFAULT 'weekly' CHECK (digest_frequency IN ('daily', 'weekly', 'never')),
  ADD COLUMN IF NOT EXISTS notification_timezone TEXT DEFAULT 'Europe/Lisbon';


-- ============================================================
-- 009_notify_venues_personas_promoters.sql
-- ============================================================
-- Notification preferences: venues, personas, promoters (Supabase)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notify_venues BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_personas BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_promoters BOOLEAN DEFAULT false;


-- ============================================================
-- 010_onboarding.sql
-- ============================================================
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


-- ============================================================
-- 011_friend_requests_event_visibility.sql
-- ============================================================
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


-- ============================================================
-- 012_user_interactions_activity.sql
-- ============================================================
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


-- ============================================================
-- 013_friend_requests_delete_policy.sql
-- ============================================================
-- Allow either party to delete (cancel pending request OR unfriend)
DROP POLICY IF EXISTS "Requester can delete own pending request" ON friend_requests;
CREATE POLICY "Either party can delete friend row" ON friend_requests
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);


-- ============================================================
-- 014_drop_user_follows.sql
-- ============================================================
-- Drop user-to-user follows table (removed: asymmetric followers/following).
-- Friends are now the only social relationship; see friend_requests (status=accepted).
-- Follow venues/promoters remain in user_follow_venues and user_follow_promoters.
DROP TABLE IF EXISTS follows;


-- ============================================================
-- 015_event_shares.sql
-- ============================================================
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


-- ============================================================
-- 016_chats.sql
-- ============================================================
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


-- ============================================================
-- 017_event_images_bucket.sql
-- ============================================================
-- Storage bucket for event images (posters, flyers) - permanent URLs for scraped Instagram etc.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow inserts via service role (API will use server client to upload)
-- Public read so event cards can use the URL directly
DROP POLICY IF EXISTS "Event images are public" ON storage.objects;
CREATE POLICY "Event images are public"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-images');


-- ============================================================
-- 020_venue_images_bucket.sql
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'venue-images',
  'venue-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Venue images are public" ON storage.objects;
CREATE POLICY "Venue images are public"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'venue-images');


-- ============================================================
-- 021_venue_profile_images.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS public.venue_profile_images (
  instagram_handle text PRIMARY KEY,
  primary_image_url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_profile_images_updated
  ON public.venue_profile_images (updated_at DESC);

ALTER TABLE public.venue_profile_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue profile images are publicly readable" ON public.venue_profile_images;
CREATE POLICY "Venue profile images are publicly readable"
ON public.venue_profile_images FOR SELECT
TO public
USING (true);

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/json'
]
WHERE id = 'venue-images';


-- ============================================================
-- 018_event_review_feedback.sql
-- ============================================================
-- Human review feedback for pipeline events (/admin/event-review ratings).
-- Written via service role from the admin API; used to tune extraction prompts.
CREATE TABLE IF NOT EXISTS public.event_review_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id text NOT NULL,
  dataset text NOT NULL DEFAULT 'needsReview' CHECK (dataset IN ('raw', 'needsReview', 'processed')),
  source_event_id text,
  quality_rating int CHECK (quality_rating BETWEEN 1 AND 10),
  notes text,
  field_corrections jsonb,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, dataset)
);

CREATE INDEX IF NOT EXISTS idx_event_review_feedback_source
  ON public.event_review_feedback (source_event_id);

-- Service-role access only (admin API); no public policies.
ALTER TABLE public.event_review_feedback ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 019_pipeline_store.sql
-- ============================================================
-- Pipeline store: high-volume scrape/extract/verify data in Supabase.
-- Watchlist + Processed Events stay in Google Sheets (human-editable).
-- Service-role access only (pipeline worker + admin API); no public policies.

-- ---- Raw scraped posts (Events_Raw equivalent) ----
CREATE TABLE IF NOT EXISTS public.pipeline_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL DEFAULT 'instagram',
  source_event_id text NOT NULL,
  source_url text,
  owner_username text,
  owner_id text,
  owner_full_name text,
  caption text,
  posted_at timestamptz,
  scraped_at timestamptz,
  run_id text,
  location_id text,
  location_name text,
  location_address text,
  latitude text,
  longitude text,
  media_type text,
  media_urls text,
  thumbnail_url text,
  permalink text,
  hashtags text,
  mentions text,
  external_links text,
  like_count text,
  comment_count text,
  stored_image_url text,
  image_status text,
  image_storage_path text,
  image_error text,
  short_code text,
  display_url text,
  carousel_slide_urls text,
  archived_slide_urls text,
  video_url text,
  raw_json jsonb,
  processing_status text NOT NULL DEFAULT 'new'
    CHECK (processing_status IN ('new', 'discarded', 'needs_review', 'processed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_posts_owner
  ON public.pipeline_posts (owner_username);
CREATE INDEX IF NOT EXISTS idx_pipeline_posts_status
  ON public.pipeline_posts (processing_status);
CREATE INDEX IF NOT EXISTS idx_pipeline_posts_posted
  ON public.pipeline_posts (posted_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pipeline_posts_scraped
  ON public.pipeline_posts (scraped_at DESC NULLS LAST);

-- ---- Per-tier AI artifacts (pre-filter, caption, vision, OCR, etc.) ----
CREATE TABLE IF NOT EXISTS public.pipeline_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.pipeline_posts (id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN (
    'pre_filter', 'caption', 'vision', 'ocr', 'video_transcript', 'merge', 'validation'
  )),
  model text,
  parsed_json jsonb,
  raw_model_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_extractions_post
  ON public.pipeline_extractions (post_id, tier);

-- ---- Needs_Review queue (human Tier 6) ----
CREATE TABLE IF NOT EXISTS public.pipeline_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id text NOT NULL UNIQUE,
  source_name text,
  source_event_id text,
  source_url text,
  owner_username text,
  caption text,
  description_short text,
  description_long text,
  validation_status text,
  validation_reasons text,
  confidence_score text,
  start_datetime text,
  venue_name_raw text,
  route text,
  raw_caption_ai_text text,
  raw_model_text text,
  thumbnail_url text,
  stored_image_url text,
  image_storage_path text,
  image_error text,
  verification_verdict text,
  verification_notes text,
  verification_sources text,
  suggested_corrections text,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_review_status
  ON public.pipeline_review_queue (review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_review_source
  ON public.pipeline_review_queue (source_event_id);

-- ---- Online verification audit (Tier 5) ----
CREATE TABLE IF NOT EXISTS public.pipeline_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  title text,
  start_datetime text,
  venue_name text,
  source_url text,
  verdict text,
  confidence text,
  title_ok text,
  datetime_ok text,
  venue_ok text,
  notes text,
  suggested_corrections text,
  sources text,
  verified_at timestamptz,
  raw_model_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_verifications_event
  ON public.pipeline_verifications (event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_verifications_event_unique
  ON public.pipeline_verifications (event_id);

-- ---- Job queue + run ledger ----
CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('scrape', 'extract', 'verify', 'full', 'profile-images')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'success', 'error', 'abort_requested', 'aborted'
  )),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  apify_run_id text,
  requested_by text,
  log text NOT NULL DEFAULT '',
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status
  ON public.pipeline_runs (status, created_at DESC);

-- ---- Scraper / pipeline config (single-row style) ----
CREATE TABLE IF NOT EXISTS public.pipeline_config (
  id text PRIMARY KEY DEFAULT 'default',
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  worker_heartbeat_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.pipeline_config (id, config_json)
VALUES ('default', '{
  "apify": { "useApifyProxy": true, "proxyCountryCode": "PT" },
  "scrapers": {
    "instagram": {
      "actorId": "shu8hvrXbJbY3Eb9W",
      "runMode": "batch",
      "resultsLimit": 20
    }
  },
  "actorInputExtras": {},
  "thresholds": {
    "broadConfidence": 0.7,
    "publishConfidence": 0.7
  }
}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pipeline_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_config ENABLE ROW LEVEL SECURITY;

