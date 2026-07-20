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
