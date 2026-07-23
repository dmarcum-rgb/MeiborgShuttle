/*
  # Allow 'geodis' role on profiles

  The original profiles_role_check only permitted 'office' and 'driver', but the
  live app also assigns a 'geodis' role (external Geodis customer login). Widen the
  check so a fresh rebuild matches the production schema.
*/

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['office'::text, 'driver'::text, 'geodis'::text]));
