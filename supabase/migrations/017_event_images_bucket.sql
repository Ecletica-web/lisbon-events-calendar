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
