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
  mode text NOT NULL CHECK (mode IN ('scrape', 'extract', 'verify', 'full')),
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
