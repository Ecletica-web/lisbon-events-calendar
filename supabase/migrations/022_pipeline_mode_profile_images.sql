-- Allow separate profile-images pipeline mode (venues + promoters IG avatars).
ALTER TABLE public.pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_mode_check;

ALTER TABLE public.pipeline_runs
  ADD CONSTRAINT pipeline_runs_mode_check
  CHECK (mode IN ('scrape', 'extract', 'verify', 'full', 'profile-images'));
