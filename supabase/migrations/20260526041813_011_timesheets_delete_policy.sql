/*
  # Add DELETE policy for timesheets

  ## Problem
  The timesheets table has RLS enabled but no DELETE policy, causing all delete
  attempts to be silently blocked.

  ## Changes
  - Adds a DELETE policy allowing authenticated users (office staff) to delete
    any timesheet. Child rows (timesheet_stops, receipt_images) are cleaned up
    automatically via ON DELETE CASCADE.
*/

CREATE POLICY "Authenticated users can delete timesheets"
  ON timesheets
  FOR DELETE
  TO authenticated
  USING (true);
