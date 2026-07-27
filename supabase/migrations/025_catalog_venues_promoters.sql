-- Catalog SoT: venues + promoters in Postgres (replaces Sheets for scrape + public catalogs).
-- Seed from Sheets/CSV via pipeline/scripts/seed-catalog-from-sheets.ts
-- Writes: service role (admin API / pipeline). Public read for app loaders.

CREATE TABLE IF NOT EXISTS public.venues (
  venue_id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  instagram_handle text,
  primary_image_url text,
  description_short text,
  website_url text,
  venue_tags text[] NOT NULL DEFAULT '{}',
  address text,
  city text,
  neighborhood text,
  region text,
  country text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  venue_url text,
  instagram_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venues_instagram_handle
  ON public.venues (lower(instagram_handle))
  WHERE instagram_handle IS NOT NULL AND instagram_handle <> '';

CREATE INDEX IF NOT EXISTS idx_venues_is_active ON public.venues (is_active);
CREATE INDEX IF NOT EXISTS idx_venues_name ON public.venues (lower(name));

CREATE TABLE IF NOT EXISTS public.promoters (
  promoter_id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  instagram_handle text,
  website_url text,
  description_short text,
  primary_image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promoters_instagram_handle
  ON public.promoters (lower(instagram_handle))
  WHERE instagram_handle IS NOT NULL AND instagram_handle <> '';

CREATE INDEX IF NOT EXISTS idx_promoters_is_active ON public.promoters (is_active);

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promoters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venues are publicly readable" ON public.venues;
CREATE POLICY "Venues are publicly readable"
ON public.venues FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "Promoters are publicly readable" ON public.promoters;
CREATE POLICY "Promoters are publicly readable"
ON public.promoters FOR SELECT
TO public
USING (true);

-- Inserts/updates use SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).

COMMENT ON TABLE public.venues IS 'Catalog SoT for venues + scrape handles (instagram_handle + is_active)';
COMMENT ON TABLE public.promoters IS 'Catalog SoT for promoters + scrape handles (instagram_handle + is_active)';
