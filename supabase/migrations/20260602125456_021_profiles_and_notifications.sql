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
