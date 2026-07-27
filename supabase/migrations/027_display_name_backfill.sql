-- Backfill display_name from legacy name; keep signup trigger in sync.
-- Friend/search APIs prefer display_name || name; this reduces "Unknown" requesters.

UPDATE public.user_profiles
SET display_name = NULLIF(TRIM(name), '')
WHERE (display_name IS NULL OR TRIM(display_name) = '')
  AND name IS NOT NULL
  AND TRIM(name) <> '';

-- Replace handle_new_user to also set display_name from auth metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_name text;
BEGIN
  meta_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(COALESCE(NEW.email, ''), '@', 1)
  );
  INSERT INTO public.user_profiles (id, email, name, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    meta_name,
    meta_name
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(public.user_profiles.name, EXCLUDED.name),
    display_name = COALESCE(public.user_profiles.display_name, EXCLUDED.display_name),
    updated_at = now();
  RETURN NEW;
END;
$$;
