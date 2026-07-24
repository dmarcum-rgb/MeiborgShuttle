/*
  # Master Toll Sheets

  Office users upload the official toll-provider workbook (EZPass/ELITE/etc,
  "Customer Toll Details" for Meiborg Bros account 206789). Each upload is one
  billing period; every toll transaction is stored as its own row so the Geodis
  pre-billing report can bill the *actual* tolls — matched to a shuttle driver by
  Truck ID + Exit Date — instead of driver self-reported amounts, and so the
  export can carry a line-item proof sheet.

  1. New Tables

    - `toll_uploads`
      One row per uploaded workbook (a batch).
      - `id` (uuid, pk)
      - `filename` (text)
      - `account` (text) — toll account, e.g. 206789
      - `period_start` / `period_end` (date) — exit-date range the sheet covers
      - `transaction_count` (int)
      - `total_amount` (numeric)
      - `uploaded_by` (uuid) — auth.uid()
      - `uploaded_at` (timestamptz)

    - `master_tolls`
      One row per toll transaction from the workbook's data sheet.
      - `id` (uuid, pk)
      - `upload_id` (uuid FK -> toll_uploads ON DELETE CASCADE)
      - `truck_id` (text) — Truck ID column; the join key to a shuttle driver
      - `post_date` / `invoice_date` (date, nullable)
      - `source` / `read_type` (text)
      - `device_id` (text) — Toll Device ID or Plate
      - `agency` (text)
      - `entry_plaza` / `exit_plaza` (text)
      - `exit_date` (date) — attribution + week-matching key
      - `exit_time` (text) — HH:MM for display
      - `toll_class` (text) — Cl column
      - `amount` (numeric) — Toll $
      - `created_at` (timestamptz)

  2. Security
    - RLS on both tables.
    - All authenticated users can read (office reads them in pre-billing).
    - Only office users may insert/delete (upload / remove a sheet).
*/

CREATE TABLE IF NOT EXISTS toll_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL DEFAULT '',
  account text NOT NULL DEFAULT '',
  period_start date,
  period_end date,
  transaction_count int NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  uploaded_by uuid,
  uploaded_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_tolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES toll_uploads(id) ON DELETE CASCADE,
  truck_id text NOT NULL DEFAULT '',
  post_date date,
  invoice_date date,
  source text NOT NULL DEFAULT '',
  read_type text NOT NULL DEFAULT '',
  device_id text NOT NULL DEFAULT '',
  agency text NOT NULL DEFAULT '',
  entry_plaza text NOT NULL DEFAULT '',
  exit_plaza text NOT NULL DEFAULT '',
  exit_date date,
  exit_time text NOT NULL DEFAULT '',
  toll_class text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE toll_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_tolls ENABLE ROW LEVEL SECURITY;

-- toll_uploads policies
CREATE POLICY "Authenticated can read toll uploads"
  ON toll_uploads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Office can insert toll uploads"
  ON toll_uploads FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'office'));

CREATE POLICY "Office can delete toll uploads"
  ON toll_uploads FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'office'));

-- master_tolls policies
CREATE POLICY "Authenticated can read master tolls"
  ON master_tolls FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Office can insert master tolls"
  ON master_tolls FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'office'));

CREATE POLICY "Office can delete master tolls"
  ON master_tolls FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'office'));

CREATE INDEX IF NOT EXISTS master_tolls_upload_id_idx ON master_tolls (upload_id);
CREATE INDEX IF NOT EXISTS master_tolls_truck_id_idx ON master_tolls (truck_id);
CREATE INDEX IF NOT EXISTS master_tolls_exit_date_idx ON master_tolls (exit_date);
CREATE INDEX IF NOT EXISTS toll_uploads_period_idx ON toll_uploads (period_start, period_end);
