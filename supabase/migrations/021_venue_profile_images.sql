-- Instagram profile pics for venues (survives Sheets API outages).
-- Pipeline upserts after archiving to venue-images; /venues merges by instagram_handle.

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

-- Allow _index.json manifest in the venue-images bucket
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/json'
]
WHERE id = 'venue-images';

-- Inserts/updates use SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
