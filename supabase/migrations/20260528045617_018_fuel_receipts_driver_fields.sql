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
