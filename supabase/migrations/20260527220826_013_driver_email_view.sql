/*
  # Driver email lookup view

  Creates a secure view exposing auth user IDs and emails for driver accounts only.
  This allows the frontend to derive display names for drivers who haven't yet
  submitted a timesheet (and thus have no driver_profile row).

  - New view: driver_auth_emails
    - id: auth user UUID
    - email: user email address
  - Only includes users with emails matching the driver pattern
  - RLS: readable by authenticated users (office staff)
*/

CREATE OR REPLACE VIEW driver_auth_emails AS
  SELECT id, email
  FROM auth.users
  WHERE email LIKE 'driver-%@meiborg.local';

GRANT SELECT ON driver_auth_emails TO authenticated;
