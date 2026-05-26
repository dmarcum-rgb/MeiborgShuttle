/*
  # Allow anonymous read access to drivers

  The login screen needs to list driver names before a user is authenticated.
  This policy allows unauthenticated (anon) users to read driver names and
  status so the login dropdown can be populated.
*/

CREATE POLICY "Public can view active drivers"
  ON drivers FOR SELECT
  TO anon
  USING (status = 'active');
