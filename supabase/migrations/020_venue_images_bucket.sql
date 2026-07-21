-- Public storage for venue Instagram profile pictures.
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
