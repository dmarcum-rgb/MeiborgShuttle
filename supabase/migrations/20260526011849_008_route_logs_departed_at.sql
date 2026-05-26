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
