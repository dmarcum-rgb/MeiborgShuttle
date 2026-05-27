/*
  # Fix driver name resolution function

  Fixes type mismatch between varchar and text in the RETURNS TABLE definition.
*/

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
      initcap(replace(
        regexp_replace(u.email::text, '^driver-(.+)@meiborg\.local$', '\1'),
        '-', ' '
      ))
    )::text AS display_name,
    u.email::text
  FROM auth.users u
  LEFT JOIN driver_profiles dp ON dp.driver_id = u.id::text
  WHERE u.email LIKE 'driver-%@meiborg.local';
END;
$$;

GRANT EXECUTE ON FUNCTION get_driver_names() TO authenticated;
