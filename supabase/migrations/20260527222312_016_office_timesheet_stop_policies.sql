/*
  # Office staff timesheet stop editing policies

  Allows authenticated office users to insert and delete timesheet_stops
  so they can fully edit any timesheet regardless of who submitted it.

  Also adds a DELETE policy for timesheet_stops (currently missing entirely).
*/

CREATE POLICY "Office can insert timesheet stops"
  ON timesheet_stops FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Office can delete timesheet stops"
  ON timesheet_stops FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Office can update timesheet stops"
  ON timesheet_stops FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
