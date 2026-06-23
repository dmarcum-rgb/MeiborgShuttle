
-- Allow office users to delete receipt_images when deleting a timesheet
CREATE POLICY "Office can delete receipt images"
  ON receipt_images FOR DELETE
  TO authenticated
  USING (true);
