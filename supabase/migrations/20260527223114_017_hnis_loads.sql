/*
  # HNIS Load Log Table

  Stores HNIS (Honda North America) load logs submitted by drivers.
  Each entry captures one supplier pickup trip with all timing and toll details.

  Fields mirror the paper form:
  - driver_id: auth user UUID of the driver
  - driver_name: display name (denormalized for reporting)
  - load_number: HNIS load number
  - log_date: date of the load
  - supplier_name: name of the supplier picked up from
  - supplier_address: supplier street address
  - departure_time_to_supplier: time driver left their last location heading to supplier
  - arrival_time_to_supplier: time driver arrived at supplier
  - departure_time_from_supplier: time driver left supplier (loaded)
  - arrival_time_to_plant: time driver arrived at plant/destination
  - tolls_accrued: dollar amount of tolls for this load run
  - notes: any additional notes

  Security:
  - Drivers can insert and read their own records
  - Office (authenticated) can read all records
*/

CREATE TABLE IF NOT EXISTS hnis_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id text NOT NULL,
  driver_name text NOT NULL DEFAULT '',
  load_number text NOT NULL DEFAULT '',
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_name text NOT NULL DEFAULT '',
  supplier_address text NOT NULL DEFAULT '',
  departure_time_to_supplier time,
  arrival_time_to_supplier time,
  departure_time_from_supplier time,
  arrival_time_to_plant time,
  tolls_accrued numeric(8,2),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hnis_loads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert own hnis loads"
  ON hnis_loads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = driver_id);

CREATE POLICY "Drivers can read own hnis loads"
  ON hnis_loads FOR SELECT
  TO authenticated
  USING (auth.uid()::text = driver_id);

CREATE POLICY "Office can read all hnis loads"
  ON hnis_loads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Office can update hnis loads"
  ON hnis_loads FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Office can delete hnis loads"
  ON hnis_loads FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS hnis_loads_driver_id_idx ON hnis_loads(driver_id);
CREATE INDEX IF NOT EXISTS hnis_loads_log_date_idx ON hnis_loads(log_date);
