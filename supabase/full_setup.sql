-- ============================================================
-- Meiborg Shuttles — full Supabase setup (generated)
-- Run this once in a NEW Supabase project's SQL editor.
-- Concatenates all migrations in order + creates the receipts bucket.
-- ============================================================

-- Private storage bucket for receipt images (reads via signed URLs)
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts','receipts', false) ON CONFLICT (id) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>> migrations/20260526000458_001_initial_schema.sql
/*
  # Meiborg Driver Management System - Initial Schema

  Creates the complete database structure for tracking driver information,
  stops, receipts, hours logged, and invoice generation for Geodis.

  ## Tables Created

  ### 1. drivers
  Stores core driver information including name, truck number, and status.

  ### 2. stops
  Records delivery/pickup stops made by drivers.

  ### 3. fuel_receipts
  Tracks fuel purchases for each driver.

  ### 4. toll_receipts
  Tracks toll payments for each driver.

  ### 5. invoices
  Invoice records for Geodis billing at $79/hour.

  ### 6. hours_log
  Tracks hours worked by each driver for billing purposes.

  ## Security
  - Row Level Security (RLS) enabled on all tables
  - All operations require authentication

  ## Notes
  1. All tables use UUID primary keys
  2. Foreign key constraints ensure data integrity
  3. Timestamps track record creation and updates
  4. RLS policies restrict access to authenticated users only
*/

-- Create drivers table
CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  truck_number text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create stops table
CREATE TABLE IF NOT EXISTS stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  location text NOT NULL,
  stop_type text NOT NULL DEFAULT 'delivery',
  notes text DEFAULT '',
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- Create fuel_receipts table
CREATE TABLE IF NOT EXISTS fuel_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  amount decimal(10,2) NOT NULL,
  gallons decimal(10,2),
  location text NOT NULL,
  receipt_number text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Create toll_receipts table
CREATE TABLE IF NOT EXISTS toll_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  amount decimal(10,2) NOT NULL,
  location text NOT NULL,
  receipt_number text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  date_from date NOT NULL,
  date_to date NOT NULL,
  total_hours decimal(10,2) NOT NULL DEFAULT 0,
  rate_per_hour decimal(10,2) NOT NULL DEFAULT 79.00,
  total_amount decimal(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  paid_at timestamptz
);

-- Create hours_log table (after invoices so FK can reference it)
CREATE TABLE IF NOT EXISTS hours_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  hours decimal(10,2) NOT NULL,
  notes text DEFAULT '',
  billed boolean DEFAULT false,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE toll_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hours_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies for drivers
CREATE POLICY "Authenticated users can view all drivers"
  ON drivers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create drivers"
  ON drivers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update drivers"
  ON drivers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete drivers"
  ON drivers FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for stops
CREATE POLICY "Authenticated users can view all stops"
  ON stops FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create stops"
  ON stops FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update stops"
  ON stops FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete stops"
  ON stops FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for fuel_receipts
CREATE POLICY "Authenticated users can view all fuel receipts"
  ON fuel_receipts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create fuel receipts"
  ON fuel_receipts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update fuel receipts"
  ON fuel_receipts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete fuel receipts"
  ON fuel_receipts FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for toll_receipts
CREATE POLICY "Authenticated users can view all toll receipts"
  ON toll_receipts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create toll receipts"
  ON toll_receipts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update toll receipts"
  ON toll_receipts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete toll receipts"
  ON toll_receipts FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for hours_log
CREATE POLICY "Authenticated users can view all hours log"
  ON hours_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create hours log"
  ON hours_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update hours log"
  ON hours_log FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete hours log"
  ON hours_log FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for invoices
CREATE POLICY "Authenticated users can view all invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_stops_driver_id ON stops(driver_id);
CREATE INDEX IF NOT EXISTS idx_stops_date ON stops(date);
CREATE INDEX IF NOT EXISTS idx_fuel_receipts_driver_id ON fuel_receipts(driver_id);
CREATE INDEX IF NOT EXISTS idx_fuel_receipts_date ON fuel_receipts(date);
CREATE INDEX IF NOT EXISTS idx_toll_receipts_driver_id ON toll_receipts(driver_id);
CREATE INDEX IF NOT EXISTS idx_toll_receipts_date ON toll_receipts(date);
CREATE INDEX IF NOT EXISTS idx_hours_log_driver_id ON hours_log(driver_id);
CREATE INDEX IF NOT EXISTS idx_hours_log_date ON hours_log(date);
CREATE INDEX IF NOT EXISTS idx_hours_log_billed ON hours_log(billed);
CREATE INDEX IF NOT EXISTS idx_invoices_driver_id ON invoices(driver_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for drivers table
CREATE TRIGGER update_drivers_updated_at
    BEFORE UPDATE ON drivers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to generate invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text AS $$
DECLARE
  prefix text := 'INV';
  date_part text := to_char(now(), 'YYYYMMDD');
  seq_num integer;
  invoice_num text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 12 FOR 4) AS integer)), 0) + 1
  INTO seq_num
  FROM invoices
  WHERE invoice_number LIKE prefix || '-' || date_part || '-%';
  
  invoice_num := prefix || '-' || date_part || '-' || LPAD(seq_num::text, 4, '0');
  RETURN invoice_num;
END;
$$ LANGUAGE plpgsql;

-- >>>>>>>>>>>>>>>>>>>> migrations/20260526003138_002_route_logs.sql
/*
  # Create route_logs table

  1. New Tables
    - `route_logs`
      - `id` (uuid, primary key)
      - `driver_id` (text) — the auth user id of the driver
      - `vendor_name` (text) — name of the destination vendor
      - `address` (text) — full destination address
      - `started_at` (timestamptz) — when the driver pressed Start Route
      - `arrived_at` (timestamptz, nullable) — auto-set when geofence triggers
      - `lat` (numeric, nullable) — vendor latitude used for geofence
      - `lng` (numeric, nullable) — vendor longitude used for geofence

  2. Security
    - Enable RLS
    - Authenticated drivers can insert their own logs
    - Authenticated drivers can update their own logs (for arrived_at)
    - Authenticated drivers can read their own logs
    - Office staff (all authenticated users) can read all logs
*/

CREATE TABLE IF NOT EXISTS route_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id text NOT NULL,
  vendor_name text NOT NULL,
  address text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  arrived_at timestamptz,
  lat numeric,
  lng numeric
);

ALTER TABLE route_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert own route logs"
  ON route_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = driver_id);

CREATE POLICY "Drivers can update own route logs"
  ON route_logs FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = driver_id)
  WITH CHECK (auth.uid()::text = driver_id);

CREATE POLICY "Authenticated users can read all route logs"
  ON route_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS route_logs_driver_id_idx ON route_logs (driver_id);
CREATE INDEX IF NOT EXISTS route_logs_started_at_idx ON route_logs (started_at DESC);


-- >>>>>>>>>>>>>>>>>>>> migrations/20260526003538_003_clock_events.sql
/*
  # Create clock_events table

  1. New Tables
    - `clock_events`
      - `id` (uuid, primary key)
      - `driver_id` (text) — auth user id
      - `type` (text) — 'clock_in' or 'clock_out'
      - `timestamp` (timestamptz) — when the event occurred

  2. Security
    - Enable RLS
    - Drivers can insert and read their own events
    - All authenticated users can read all events (for office reporting)
*/

CREATE TABLE IF NOT EXISTS clock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('clock_in', 'clock_out')),
  timestamp timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert own clock events"
  ON clock_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = driver_id);

CREATE POLICY "Drivers can read own clock events"
  ON clock_events FOR SELECT
  TO authenticated
  USING (auth.uid()::text = driver_id);

CREATE INDEX IF NOT EXISTS clock_events_driver_id_idx ON clock_events (driver_id);
CREATE INDEX IF NOT EXISTS clock_events_timestamp_idx ON clock_events (timestamp DESC);


-- >>>>>>>>>>>>>>>>>>>> migrations/20260526004209_004_timesheets.sql
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


-- >>>>>>>>>>>>>>>>>>>> migrations/20260526004242_005_storage_policies.sql
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


-- >>>>>>>>>>>>>>>>>>>> migrations/20260526011120_007_timesheets_toll_total.sql
/*
  # Add toll_total to timesheets

  Adds a nullable numeric toll_total column to the timesheets table so the
  overall toll spend for the day can be stored alongside fuel totals.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheets' AND column_name = 'toll_total'
  ) THEN
    ALTER TABLE timesheets ADD COLUMN toll_total numeric;
  END IF;
END $$;


-- >>>>>>>>>>>>>>>>>>>> migrations/20260526011849_008_route_logs_departed_at.sql
/*
  # Add departed_at to route_logs

  Adds a nullable departed_at timestamp column so departure time can be
  recorded when a driver leaves a stop and pre-filled into the timesheet.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'route_logs' AND column_name = 'departed_at'
  ) THEN
    ALTER TABLE route_logs ADD COLUMN departed_at timestamptz;
  END IF;
END $$;


-- >>>>>>>>>>>>>>>>>>>> migrations/20260526012812_009_vendor_stops_master.sql
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


-- >>>>>>>>>>>>>>>>>>>> migrations/20260526015143_010_seed_vendor_stops.sql
/*
  # Seed vendor_stops with all active route locations

  Inserts all 33 vendor/stop locations that are hardcoded in the driver app
  into the vendor_stops table so they appear in the Stops management tab
  and can be managed from the office.

  Each row includes:
    - name: vendor display name
    - address: full street address (combined with city for some)
    - city: city/state string
    - lat/lng: GPS coordinates for geofence detection (where available)
    - toll_amount: default toll cost for that stop
    - notes: any special instructions (Drop & Hook, paired-stop notes, etc.)
    - active: true for all initial entries
*/

INSERT INTO vendor_stops (name, address, city, lat, lng, toll_amount, notes, active) VALUES
  ('Alliance Ind. (Waupaca)', 'N. 2467 Vaughan Rd', 'Waupaca, WI 54981', 44.3266842, -89.0013343, NULL, '', true),
  ('Bolzoni Auramo Inc.', '17635 Hoffman Way', 'Homewood, IL 60430', 41.5702390, -87.6459885, 84.50, '', true),
  ('BTS 5', '6709 Main St.', 'Union, IL 60180', 42.2307898, -88.5431338, NULL, '', true),
  ('Capital Equip. Kaukauna', '2550 Progress Way', 'Kaukauna, WI 54130', 44.3047952, -88.2591546, NULL, 'w/ Heartland', true),
  ('CCTV', '1111 Rose Rd.', 'Lake Zurich, IL 60047', 42.2010611, -88.0693165, NULL, 'w/ Clipper', true),
  ('Clipper Ind. Inc.', '1520 W. Norwood Ave', 'Itasca, IL 60143', 41.9859581, -88.0410774, 23.30, '', true),
  ('DLS Elect. Systems', '166 South Carter', 'Genoa City, WI 53128', 42.5014586, -88.3256606, NULL, '', true),
  ('Donghua', '493 Mission St.', 'Carol Stream, IL 60188', 41.9256210, -88.1013515, NULL, 'w/ O''Hare', true),
  ('Equipment Depot - Itasca', '751 Expressway Dr.', 'Itasca, IL 60143', 41.9796393, -88.0258205, 23.30, '', true),
  ('Equipment Depot - Heartland', '1100 Cottonwood Ave.', 'Heartland, WI 53029', 43.0828485, -88.3509866, NULL, '', true),
  ('Equipment Depot - Rockford', '4414 11th Street', 'Rockford, IL 61109', 42.2127933, -89.0723229, NULL, '', true),
  ('Fairchild Ind.', '475 Capital Drive', 'Lake Zurich, IL 60047', 42.2064137, -88.0650475, NULL, '', true),
  ('Friedman (Flatbed)', '4303 Kenedy Ave.', 'East Chicago, IN 46312', 41.6386198, -87.4616017, 115.95, '', true),
  ('Grammer', 'Meiborg/Opps. LOAD', '', NULL, NULL, NULL, '', true),
  ('Kapco Inc. (3am from Rockford)', '1150 Cheyenne Ave.', 'Grafton, WI 53024', 43.3193221, -87.9350483, 19.35, 'Drop & Hook', true),
  ('Kuriyama Of America Inc.', '14200 Commerce Court', 'Huntley, IL 60142', 42.1243796, -88.4262014, 6.40, '', true),
  ('L.J. Fab.', '944 Research Pkwy.', 'Rockford, IL 61109', 42.2183322, -89.0830221, NULL, '', true),
  ('Leading Americas', '130 Arrowhead Dr.', 'Hampshire, IL 60410', 42.1487165, -88.5084026, NULL, '', true),
  ('Leibovich', '305 Peoples Ave.', 'Rockford, IL 61104', 42.2413258, -89.0899886, 33.90, 'Drop & Hook', true),
  ('Liftek', 'Meiborg/Opps. LOAD', '', NULL, NULL, NULL, '', true),
  ('Loginext, MLA, C.L.', '340 Commerce Dr. Unit A', 'Crystal Lake, IL 60014', 42.2496403, -88.3297300, NULL, '', true),
  ('MAHLE Rockford', '4814 American Rd.', 'Rockford, IL 61109', 42.2296901, -89.0223648, NULL, '', true),
  ('Meiborg Belvedere WH', '795 Landmark Dr.', 'Belvedere, IL 61008', 42.2524515, -88.8931015, NULL, '', true),
  ('Michellin - OEM (Camso)', '24601 S. Bradley St', 'Channahon, IL 60410', 41.4441171, -88.1949385, 67.60, '', true),
  ('Milama', 'Meiborg/Opps. LOAD', '', NULL, NULL, NULL, '', true),
  ('Misa/Miyama', 'Meiborg/Opps. LOAD', '', NULL, NULL, NULL, '', true),
  ('New Age', '2120 N. West St.', 'River Grove, IL 60171', 41.9183795, -87.8501759, 23.30, 'w/ Northfield', true),
  ('Northfield Ind. LLC (980)', '980 Lunt Ave.', 'Elk Grove Village, IL 60007', 42.0019422, -87.9724457, 23.30, 'w/ New Age', true),
  ('O''Hare Metal Prod. Div', '1098 Touhy Ave.', 'Elk Grove Village, IL 60007', 42.0076960, -87.9706280, 23.30, '', true),
  ('PHC', 'Meiborg/Opps. LOAD', '', NULL, NULL, NULL, '', true),
  ('PMW, Shhhhhh', '1005 McKinley Ave.', 'Belvidere, IL 61008', 42.2705504, -88.8414257, NULL, '', true),
  ('Timber Creek (Wedges)', '128 Badger St.', 'Walworth, WI 53184', 42.5381975, -88.5982851, NULL, '', true),
  ('UCA Marengo', '240 N. Prospect Ave.', 'Marengo, IL 60152', 42.2501490, -88.6081303, NULL, '', true),
  ('Value Added', '1595 Northrock Ct.', 'Rockford, IL 61103', 42.3351396, -89.0700624, NULL, '', true)
ON CONFLICT DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>> migrations/20260526041813_011_timesheets_delete_policy.sql
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


-- >>>>>>>>>>>>>>>>>>>> migrations/20260526193409_012_drivers_public_read.sql
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


-- >>>>>>>>>>>>>>>>>>>> migrations/20260527220826_013_driver_email_view.sql
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


-- >>>>>>>>>>>>>>>>>>>> migrations/20260527221102_014_driver_name_resolution.sql
/*
  # Driver name resolution function

  Creates a SECURITY DEFINER function that returns all driver auth user IDs
  with their resolved display names. This bypasses RLS so the office dashboard
  can see all drivers regardless of which user is logged in.

  Name resolution priority:
  1. driver_profiles.full_name (set by the driver themselves on first login)
  2. Derived from email pattern: driver-john-doe@meiborg.local → "John Doe"

  Also replaces the driver_auth_emails view with a proper security definer
  function to ensure all driver rows are returned.
*/

-- Drop old view that was subject to RLS row filtering
DROP VIEW IF EXISTS driver_auth_emails;

-- Function: returns all driver users with resolved display names
CREATE OR REPLACE FUNCTION get_driver_names()
RETURNS TABLE(driver_id text, display_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id::text AS driver_id,
    COALESCE(
      dp.full_name,
      -- Derive name from email: driver-john-doe@meiborg.local → "John Doe"
      initcap(replace(
        regexp_replace(u.email, '^driver-(.+)@meiborg\.local$', '\1'),
        '-', ' '
      ))
    ) AS display_name,
    u.email
  FROM auth.users u
  LEFT JOIN driver_profiles dp ON dp.driver_id = u.id::text
  WHERE u.email LIKE 'driver-%@meiborg.local';
END;
$$;

GRANT EXECUTE ON FUNCTION get_driver_names() TO authenticated;


-- >>>>>>>>>>>>>>>>>>>> migrations/20260527221114_015_driver_name_resolution_fix.sql
/*
  # Fix driver name resolution function

  Fixes type mismatch between varchar and text in the RETURNS TABLE definition.
*/

CREATE OR REPLACE FUNCTION get_driver_names()
RETURNS TABLE(driver_id text, display_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id::text AS driver_id,
    COALESCE(
      dp.full_name,
      initcap(replace(
        regexp_replace(u.email::text, '^driver-(.+)@meiborg\.local$', '\1'),
        '-', ' '
      ))
    )::text AS display_name,
    u.email::text
  FROM auth.users u
  LEFT JOIN driver_profiles dp ON dp.driver_id = u.id::text
  WHERE u.email LIKE 'driver-%@meiborg.local';
END;
$$;

GRANT EXECUTE ON FUNCTION get_driver_names() TO authenticated;


-- >>>>>>>>>>>>>>>>>>>> migrations/20260527222312_016_office_timesheet_stop_policies.sql
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


-- >>>>>>>>>>>>>>>>>>>> migrations/20260527223114_017_hnis_loads.sql
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


-- >>>>>>>>>>>>>>>>>>>> migrations/20260528045617_018_fuel_receipts_driver_fields.sql
/*
  # Add driver_name and vehicle_number to fuel_receipts

  The fuel_receipts table previously stored driver info via a UUID FK to the drivers table.
  Since manual receipts need to work independently (and match the timesheet-sourced rows),
  we add denormalized driver_name and vehicle_number text columns.

  The existing driver_id column is made nullable since new manual entries use driver_name directly.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fuel_receipts' AND column_name = 'driver_name'
  ) THEN
    ALTER TABLE fuel_receipts ADD COLUMN driver_name text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fuel_receipts' AND column_name = 'vehicle_number'
  ) THEN
    ALTER TABLE fuel_receipts ADD COLUMN vehicle_number text NOT NULL DEFAULT '';
  END IF;
END $$;

ALTER TABLE fuel_receipts ALTER COLUMN driver_id DROP NOT NULL;


-- >>>>>>>>>>>>>>>>>>>> migrations/20260528122536_019_geofence_missing_stops.sql
/*
  # Add geofence coordinates to stops missing lat/lng

  Updates three vendor stops that had real street addresses but no coordinates.
  Coordinates sourced from OpenStreetMap / Nominatim geocoding.

  - Meiborg Shop, 11th: 3814 11th St, Rockford, IL 61109
  - UCA Plant #2 201: 201 N Prospect St, Marengo, IL 60152
  - UCA Plant #3 (Geodis): 19720 E Grant Hwy, Marengo, IL 60152

  Grammer (24806 State Route 697, Delphos OH) could not be geocoded —
  it is listed as a Meiborg/Opps internal load and has no confirmed address.
*/

UPDATE vendor_stops SET lat = 42.2147725, lng = -89.0720146
  WHERE name = 'Meiborg Shop, 11th';

UPDATE vendor_stops SET lat = 42.2525117, lng = -88.5961920
  WHERE name = 'UCA Plant #2 201';

UPDATE vendor_stops SET lat = 42.2403008, lng = -88.5879921
  WHERE name = 'UCA Plant #3 (Geodis)';


-- >>>>>>>>>>>>>>>>>>>> migrations/20260528132955_020_grammer_geofence.sql
/*
  # Add geofence coordinates for Grammer

  Grammer Americas, 24086 OH-697, Delphos, OH 45833
  Coordinates sourced from Google Maps short link: maps.app.goo.gl/PSAZhDomrG8AaCtD6
*/

UPDATE vendor_stops SET lat = 40.8407164, lng = -84.3583126
  WHERE name = 'Grammer';


-- >>>>>>>>>>>>>>>>>>>> migrations/20260602125456_021_profiles_and_notifications.sql
/*
  # Profiles table, notifications table, and clock-event notification trigger

  ## Changes

  ### 1. profiles table
  - Stores role for every auth user: 'office' or 'driver'
  - Seeded from existing auth.users by inspecting email prefix
  - New users get a profile auto-created via trigger on auth.users insert

  ### 2. notifications table
  - id, recipient_id (auth uid), type, title, body, metadata (jsonb), read, created_at
  - Office users receive a row here whenever a driver clocks in or out

  ### 3. Trigger: notify_office_on_clock_event
  - Fires AFTER INSERT on clock_events
  - Looks up the driver's name from driver_profiles (falls back to driver_id)
  - Inserts one notification row per office user

  ### Security
  - RLS enabled on both tables
  - Users can read/update only their own profile
  - Users can read/update only their own notifications
*/

-- ── profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'driver' CHECK (role IN ('office', 'driver')),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Seed existing users: office if email starts with 'office', else driver
INSERT INTO profiles (id, role)
SELECT
  id,
  CASE WHEN email ILIKE 'office%' THEN 'office' ELSE 'driver' END
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Auto-create profile on new sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text NOT NULL DEFAULT 'clock_event',
  title        text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',
  metadata     jsonb DEFAULT '{}',
  read         boolean NOT NULL DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can mark own notifications read"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Index for fast unread count lookups
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read
  ON notifications (recipient_id, read);

-- ── Trigger: fan-out notification to all office users on clock event ──────────
CREATE OR REPLACE FUNCTION notify_office_on_clock_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  driver_name text;
  event_label text;
  msg_body    text;
BEGIN
  -- Resolve driver display name
  SELECT COALESCE(full_name, NEW.driver_id)
    INTO driver_name
    FROM driver_profiles
   WHERE driver_id = NEW.driver_id
   LIMIT 1;

  IF driver_name IS NULL THEN
    driver_name := NEW.driver_id;
  END IF;

  event_label := CASE NEW.type
    WHEN 'clock_in'  THEN 'clocked in'
    WHEN 'clock_out' THEN 'clocked out'
    ELSE NEW.type
  END;

  msg_body := driver_name || ' ' || event_label || ' at ' ||
    to_char(NEW.timestamp AT TIME ZONE 'America/Chicago', 'Mon DD, HH:MI AM');

  -- Insert one notification per office user
  INSERT INTO notifications (recipient_id, type, title, body, metadata)
  SELECT
    p.id,
    'clock_event',
    CASE NEW.type
      WHEN 'clock_in'  THEN 'Driver Clocked In'
      WHEN 'clock_out' THEN 'Driver Clocked Out'
      ELSE 'Clock Event'
    END,
    msg_body,
    jsonb_build_object(
      'driver_id',   NEW.driver_id,
      'driver_name', driver_name,
      'event_type',  NEW.type,
      'event_time',  NEW.timestamp
    )
  FROM profiles p
  WHERE p.role = 'office';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_clock_event_notify ON clock_events;
CREATE TRIGGER on_clock_event_notify
  AFTER INSERT ON clock_events
  FOR EACH ROW EXECUTE FUNCTION notify_office_on_clock_event();


-- >>>>>>>>>>>>>>>>>>>> migrations/20260608201613_022_fix_handle_new_user_search_path.sql

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


-- >>>>>>>>>>>>>>>>>>>> migrations/20260609162954_023_system_errors.sql

CREATE TABLE public.system_errors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  error_type text NOT NULL DEFAULT 'auto',
  source text,
  message text NOT NULL,
  context jsonb DEFAULT '{}',
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_name text,
  resolved boolean DEFAULT false NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by_name text
);

ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_insert_errors" ON public.system_errors
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "select_system_errors" ON public.system_errors
  FOR SELECT TO authenticated USING (
    reporter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'office')
  );

CREATE POLICY "office_update_errors" ON public.system_errors
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'office'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'office'));


-- >>>>>>>>>>>>>>>>>>>> migrations/20260623200642_024_receipt_images_office_delete.sql

-- Allow office users to delete receipt_images when deleting a timesheet
CREATE POLICY "Office can delete receipt images"
  ON receipt_images FOR DELETE
  TO authenticated
  USING (true);


-- >>>>>>>>>>>>>>>>>>>> migrations/20260723000000_025_profiles_geodis_role.sql
/*
  # Allow 'geodis' role on profiles

  The original profiles_role_check only permitted 'office' and 'driver', but the
  live app also assigns a 'geodis' role (external Geodis customer login). Widen the
  check so a fresh rebuild matches the production schema.
*/

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['office'::text, 'driver'::text, 'geodis'::text]));

