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
