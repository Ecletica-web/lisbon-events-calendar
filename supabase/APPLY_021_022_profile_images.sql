-- Combined: venue profile images table + profile-images pipeline mode
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/fytnwjhlinmusfrxtxaz/sql/new

-- 021_venue_profile_images
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

-- 022_pipeline_mode_profile_images
ALTER TABLE public.pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_mode_check;

ALTER TABLE public.pipeline_runs
  ADD CONSTRAINT pipeline_runs_mode_check
  CHECK (mode IN ('scrape', 'extract', 'verify', 'full', 'profile-images'));
