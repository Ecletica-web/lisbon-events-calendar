-- Proposed venues / promoters discovered during extract when catalog resolve fails
-- or unknown @mentions appear. Human review in /admin/catalog-candidates.

CREATE TABLE IF NOT EXISTS public.pipeline_catalog_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('venue', 'promoter')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  -- Dedup key: h:<handle> when IG handle known, else n:<normalized name>
  identity_key text NOT NULL,
  proposed_name text NOT NULL,
  proposed_handle text,
  suggested_city text,
  suggested_aliases text[] NOT NULL DEFAULT '{}',
  evidence_summary text,
  sample_source_url text,
  sample_caption text,
  sample_owner_username text,
  sample_venue_name_raw text,
  last_source_event_id text,
  sighting_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_entity_id text,
  resolved_at timestamptz,
  resolved_by text,
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, identity_key)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_catalog_candidates_status
  ON public.pipeline_catalog_candidates (status, kind, sighting_count DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_catalog_candidates_pending
  ON public.pipeline_catalog_candidates (last_seen_at DESC)
  WHERE status = 'pending';

COMMENT ON TABLE public.pipeline_catalog_candidates IS
  'AI/pipeline-proposed venues and promoters for human approve → catalog upsert';
