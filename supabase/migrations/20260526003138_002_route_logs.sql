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
