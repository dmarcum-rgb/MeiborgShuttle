/*
  # Storage RLS Policies for receipts bucket

  Allows authenticated drivers to upload receipt images and
  all authenticated users to read them.
*/

CREATE POLICY "Drivers can upload receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Authenticated can read receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'receipts');
