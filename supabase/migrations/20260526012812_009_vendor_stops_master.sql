/*
  # Create vendor_stops master list

  A company-managed list of all vendor pickup/delivery locations. These are
  the canonical stops that appear in the driver dashboard route selector.

  New Table: vendor_stops
    - id: uuid primary key
    - name: display name of the vendor/company
    - address: full street address
    - city: city name (for display)
    - lat/lng: optional coordinates for geofence detection
    - toll_amount: default toll cost for this stop
    - notes: any special instructions
    - active: whether this stop appears in the driver app
    - created_at: timestamp

  Security:
    - RLS enabled
    - Authenticated users can read all (drivers need to see list)
    - Only managers (service role) can write; for now allow authenticated to insert/update/delete
      since there's no role column yet — this can be tightened when roles are added
*/

CREATE TABLE IF NOT EXISTS vendor_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  lat double precision,
  lng double precision,
  toll_amount numeric(8,2),
  notes text DEFAULT '',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vendor_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vendor stops"
  ON vendor_stops FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert vendor stops"
  ON vendor_stops FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update vendor stops"
  ON vendor_stops FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete vendor stops"
  ON vendor_stops FOR DELETE
  TO authenticated
  USING (true);
