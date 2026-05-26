/*
  # Timesheets System

  Creates the daily timesheet and receipt image tables needed to go fully digital.

  1. New Tables

    - `timesheets`
      Daily timesheet record submitted by a driver at clock-out.
      - `id` (uuid, pk)
      - `driver_id` (text) — auth uid
      - `driver_name` (text)
      - `vehicle_number` (text)
      - `work_date` (date) — the day this covers
      - `start_time` (text) — e.g. "05:00"
      - `end_time` (text)
      - `total_hours` (numeric)
      - `lunch_start` (text, nullable)
      - `lunch_end` (text, nullable)
      - `notes` (text)
      - `fuel_gallons` (numeric, nullable)
      - `fuel_dollars` (numeric, nullable)
      - `status` (text) — 'pending' | 'submitted' | 'approved'
      - `submitted_at` (timestamptz, nullable)
      - `created_at` / `updated_at`

    - `timesheet_stops`
      One row per stop logged on a given day's timesheet.
      - `id` (uuid, pk)
      - `timesheet_id` (uuid FK → timesheets)
      - `vendor_name` (text)
      - `city_address` (text)
      - `arrive_time` (text)
      - `departure_time` (text)
      - `delay_reason` (text)
      - `sort_order` (int)

    - `receipt_images`
      Images of toll/fuel receipts attached to a timesheet.
      - `id` (uuid, pk)
      - `timesheet_id` (uuid FK → timesheets)
      - `driver_id` (text)
      - `receipt_type` (text) — 'toll' | 'fuel'
      - `storage_path` (text) — path in Supabase Storage
      - `uploaded_at` (timestamptz)

    - `driver_profiles`
      Stores vehicle number and display name for driver auth users.
      - `id` (uuid, pk) — matches auth.uid()
      - `driver_id` (text) UNIQUE — auth uid as text
      - `full_name` (text)
      - `vehicle_number` (text)
      - `created_at` / `updated_at`

  2. Security
    - RLS on all tables
    - Drivers can manage their own records
    - All authenticated users can read all timesheets (office access)
    - Office can update timesheet status (approved)
*/

-- driver_profiles
CREATE TABLE IF NOT EXISTS driver_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id text UNIQUE NOT NULL,
  full_name text NOT NULL DEFAULT '',
  vehicle_number text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert own profile"
  ON driver_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = driver_id);

CREATE POLICY "Drivers can update own profile"
  ON driver_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = driver_id)
  WITH CHECK (auth.uid()::text = driver_id);

CREATE POLICY "Authenticated users can read all profiles"
  ON driver_profiles FOR SELECT
  TO authenticated
  USING (true);

-- timesheets
CREATE TABLE IF NOT EXISTS timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id text NOT NULL,
  driver_name text NOT NULL DEFAULT '',
  vehicle_number text NOT NULL DEFAULT '',
  work_date date NOT NULL,
  start_time text NOT NULL DEFAULT '',
  end_time text NOT NULL DEFAULT '',
  total_hours numeric NOT NULL DEFAULT 0,
  lunch_start text NOT NULL DEFAULT '',
  lunch_end text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  fuel_gallons numeric,
  fuel_dollars numeric,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved')),
  submitted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert own timesheets"
  ON timesheets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = driver_id);

CREATE POLICY "Drivers can update own timesheets"
  ON timesheets FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = driver_id)
  WITH CHECK (auth.uid()::text = driver_id);

CREATE POLICY "Authenticated users can read all timesheets"
  ON timesheets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Office can approve timesheets"
  ON timesheets FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS timesheets_driver_id_idx ON timesheets (driver_id);
CREATE INDEX IF NOT EXISTS timesheets_work_date_idx ON timesheets (work_date DESC);
CREATE INDEX IF NOT EXISTS timesheets_status_idx ON timesheets (status);

-- timesheet_stops
CREATE TABLE IF NOT EXISTS timesheet_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  vendor_name text NOT NULL DEFAULT '',
  city_address text NOT NULL DEFAULT '',
  arrive_time text NOT NULL DEFAULT '',
  departure_time text NOT NULL DEFAULT '',
  delay_reason text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0
);

ALTER TABLE timesheet_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert own stops"
  ON timesheet_stops FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM timesheets
      WHERE timesheets.id = timesheet_id
      AND timesheets.driver_id = auth.uid()::text
    )
  );

CREATE POLICY "Drivers can update own stops"
  ON timesheet_stops FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM timesheets
      WHERE timesheets.id = timesheet_id
      AND timesheets.driver_id = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM timesheets
      WHERE timesheets.id = timesheet_id
      AND timesheets.driver_id = auth.uid()::text
    )
  );

CREATE POLICY "Authenticated users can read all timesheet stops"
  ON timesheet_stops FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS timesheet_stops_timesheet_id_idx ON timesheet_stops (timesheet_id);

-- receipt_images
CREATE TABLE IF NOT EXISTS receipt_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  driver_id text NOT NULL,
  receipt_type text NOT NULL CHECK (receipt_type IN ('toll', 'fuel')),
  storage_path text NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE receipt_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert own receipt images"
  ON receipt_images FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = driver_id);

CREATE POLICY "Authenticated users can read all receipt images"
  ON receipt_images FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS receipt_images_timesheet_id_idx ON receipt_images (timesheet_id);
