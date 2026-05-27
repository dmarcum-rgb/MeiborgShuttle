/*
  # Driver name resolution function

  Creates a SECURITY DEFINER function that returns all driver auth user IDs
  with their resolved display names. This bypasses RLS so the office dashboard
  can see all drivers regardless of which user is logged in.

  Name resolution priority:
  1. driver_profiles.full_name (set by the driver themselves on first login)
  2. Derived from email pattern: driver-john-doe@meiborg.local → "John Doe"

  Also replaces the driver_auth_emails view with a proper security definer
  function to ensure all driver rows are returned.
*/

-- Drop old view that was subject to RLS row filtering
DROP VIEW IF EXISTS driver_auth_emails;

-- Function: returns all driver users with resolved display names
CREATE OR REPLACE FUNCTION get_driver_names()
RETURNS TABLE(driver_id text, display_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id::text AS driver_id,
    COALESCE(
      dp.full_name,
      -- Derive name from email: driver-john-doe@meiborg.local → "John Doe"
      initcap(replace(
        regexp_replace(u.email, '^driver-(.+)@meiborg\.local$', '\1'),
        '-', ' '
      ))
    ) AS display_name,
    u.email
  FROM auth.users u
  LEFT JOIN driver_profiles dp ON dp.driver_id = u.id::text
  WHERE u.email LIKE 'driver-%@meiborg.local';
END;
$$;

GRANT EXECUTE ON FUNCTION get_driver_names() TO authenticated;
