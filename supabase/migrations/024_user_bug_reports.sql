-- User bug / feedback reports (screenshot + short description).
-- App currently stores reports in private Storage bucket `bug-reports`
-- ({id}/report.json + {id}/screenshot.jpg) via service role.
-- This table is the preferred long-term SoT; run in SQL Editor when ready,
-- then point lib/userBugReports.ts at Postgres if desired.

CREATE TABLE IF NOT EXISTS public.user_bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  page_url text,
  user_agent text,
  viewport text,
  screenshot_path text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'triaged', 'fixed', 'wontfix')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_bug_reports_status_created
  ON public.user_bug_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_bug_reports_created
  ON public.user_bug_reports (created_at DESC);

ALTER TABLE public.user_bug_reports ENABLE ROW LEVEL SECURITY;

-- Service-role API only (no public/anon policies).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_bug_reports TO service_role;

-- Private screenshots bucket (also creatable via Storage API).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bug-reports',
  'bug-reports',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/json']
)
ON CONFLICT (id) DO NOTHING;
