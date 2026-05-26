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