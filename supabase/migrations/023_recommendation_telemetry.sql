-- Recommendation telemetry foundation (non-ML).
-- Sessions + append-only behavioural events for future training data.
-- Service-role / server routes write; no public read policies.

-- ---- Sessions ----
CREATE TABLE IF NOT EXISTS public.recommendation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Personas are file-backed (not a Supabase table); store id as text only.
  persona_id text NULL,
  surface text NOT NULL,
  algorithm_version text NOT NULL,
  city text NOT NULL DEFAULT 'lisbon',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_sessions_user_created
  ON public.recommendation_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_sessions_algo_created
  ON public.recommendation_sessions (algorithm_version, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_sessions_surface_created
  ON public.recommendation_sessions (surface, created_at DESC);

ALTER TABLE public.recommendation_sessions ENABLE ROW LEVEL SECURITY;
-- No policies: clients must not read/write directly. Server uses service role.

-- ---- Append-only events ----
CREATE TABLE IF NOT EXISTS public.recommendation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NULL REFERENCES public.recommendation_sessions(id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_id text NOT NULL,
  action text NOT NULL
    CHECK (action IN (
      'impression',
      'open',
      'like',
      'unlike',
      'save',
      'unsave',
      'going',
      'cancel_going',
      'interested',
      'calendar_add',
      'ticket_click',
      'share',
      'pass',
      'hide'
    )),
  position integer NULL,
  algorithm_version text NULL,
  score double precision NULL,
  candidate_source text NULL,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_events_user_occurred
  ON public.recommendation_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_events_event_occurred
  ON public.recommendation_events (event_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_events_session_occurred
  ON public.recommendation_events (session_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_recommendation_events_action_occurred
  ON public.recommendation_events (action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_events_algo_occurred
  ON public.recommendation_events (algorithm_version, occurred_at DESC);

-- One impression per event per recommendation session
CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendation_events_unique_impression
  ON public.recommendation_events (session_id, event_id, action)
  WHERE action = 'impression' AND session_id IS NOT NULL;

ALTER TABLE public.recommendation_events ENABLE ROW LEVEL SECURITY;
-- No policies: clients must not read/write directly. Server uses service role.

-- ---- Training view (impressions + future outcome labels) ----
-- Outcomes only count actions that occurred AFTER the impression.
-- Not exposed publicly; query with service role / SQL editor.
CREATE OR REPLACE VIEW public.ml_training_examples_v1
WITH (security_invoker = true)
AS
SELECT
  i.id AS impression_id,
  i.session_id,
  i.user_id,
  i.event_id,
  i.position,
  i.algorithm_version,
  i.candidate_source,
  i.score,
  i.score_breakdown,
  i.occurred_at AS impression_at,
  EXISTS (
    SELECT 1 FROM public.recommendation_events a
    WHERE a.session_id IS NOT DISTINCT FROM i.session_id
      AND a.event_id = i.event_id
      AND a.action = 'open'
      AND a.occurred_at > i.occurred_at
      AND a.occurred_at <= i.occurred_at + interval '24 hours'
  ) AS opened_24h,
  EXISTS (
    SELECT 1 FROM public.recommendation_events a
    WHERE a.session_id IS NOT DISTINCT FROM i.session_id
      AND a.event_id = i.event_id
      AND a.action = 'like'
      AND a.occurred_at > i.occurred_at
      AND a.occurred_at <= i.occurred_at + interval '7 days'
  ) AS liked_7d,
  EXISTS (
    SELECT 1 FROM public.recommendation_events a
    WHERE a.session_id IS NOT DISTINCT FROM i.session_id
      AND a.event_id = i.event_id
      AND a.action = 'save'
      AND a.occurred_at > i.occurred_at
      AND a.occurred_at <= i.occurred_at + interval '7 days'
  ) AS saved_7d,
  EXISTS (
    SELECT 1 FROM public.recommendation_events a
    WHERE a.session_id IS NOT DISTINCT FROM i.session_id
      AND a.event_id = i.event_id
      AND a.action = 'going'
      AND a.occurred_at > i.occurred_at
      AND a.occurred_at <= i.occurred_at + interval '7 days'
  ) AS going_7d,
  EXISTS (
    SELECT 1 FROM public.recommendation_events a
    WHERE a.session_id IS NOT DISTINCT FROM i.session_id
      AND a.event_id = i.event_id
      AND a.action = 'calendar_add'
      AND a.occurred_at > i.occurred_at
      AND a.occurred_at <= i.occurred_at + interval '7 days'
  ) AS calendar_added_7d,
  EXISTS (
    SELECT 1 FROM public.recommendation_events a
    WHERE a.session_id IS NOT DISTINCT FROM i.session_id
      AND a.event_id = i.event_id
      AND a.action = 'ticket_click'
      AND a.occurred_at > i.occurred_at
      AND a.occurred_at <= i.occurred_at + interval '7 days'
  ) AS ticket_clicked_7d,
  EXISTS (
    SELECT 1 FROM public.recommendation_events a
    WHERE a.session_id IS NOT DISTINCT FROM i.session_id
      AND a.event_id = i.event_id
      AND a.action = 'share'
      AND a.occurred_at > i.occurred_at
      AND a.occurred_at <= i.occurred_at + interval '7 days'
  ) AS shared_7d,
  EXISTS (
    SELECT 1 FROM public.recommendation_events a
    WHERE a.session_id IS NOT DISTINCT FROM i.session_id
      AND a.event_id = i.event_id
      AND a.action = 'pass'
      AND a.occurred_at > i.occurred_at
  ) AS passed_after,
  EXISTS (
    SELECT 1 FROM public.recommendation_events a
    WHERE a.session_id IS NOT DISTINCT FROM i.session_id
      AND a.event_id = i.event_id
      AND a.action = 'hide'
      AND a.occurred_at > i.occurred_at
  ) AS hidden_after
FROM public.recommendation_events i
WHERE i.action = 'impression';

COMMENT ON VIEW public.ml_training_examples_v1 IS
  'One row per genuine impression with separate future outcome labels. Outcomes require action after impression within stated windows. Repeated impressions are prevented per session; cross-session repeats may exist. Not for public API exposure.';

REVOKE ALL ON public.ml_training_examples_v1 FROM PUBLIC;
REVOKE ALL ON public.ml_training_examples_v1 FROM anon, authenticated;
-- service_role retains access by default in Supabase
