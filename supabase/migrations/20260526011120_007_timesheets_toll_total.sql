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
