-- 112_device_presence.sql
-- Web-only timekeeping mode (organizations.settings.attendance.timekeeping_source
-- = 'web_app'): clock-in/out come from web/app punches only, and biometric-device
-- punches just record PRESENCE. These columns carry that presence on the daily
-- rollup. Filled in every mode (they're simply informative when the device also
-- keeps time). Additive and idempotent.

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS device_first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_first_seen_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS device_punch_count int NOT NULL DEFAULT 0;
