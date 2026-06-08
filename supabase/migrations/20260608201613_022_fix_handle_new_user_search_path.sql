
-- Fix handle_new_user: add SET search_path so the SECURITY DEFINER function
-- correctly resolves the "profiles" table in the public schema.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, role)
  VALUES (
    NEW.id,
    CASE WHEN NEW.email ILIKE 'office%' THEN 'office' ELSE 'driver' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
