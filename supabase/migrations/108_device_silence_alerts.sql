-- 108_device_silence_alerts.sql
-- Biometric device silence alerting.
--
-- Motivated by a real incident: Medialoop's eSSL unit stopped reaching the server on
-- 2026-08-07 and nobody noticed for six days — 18 of 20 employees had no attendance
-- recorded for the whole period, discovered only by an unrelated audit. A device that
-- stops pushing is indistinguishable from a device where nobody punched, so the failure
-- is silent by construction and needs an explicit watchdog.
--
-- This column is the alert de-duplication state: without it the daily cron would either
-- re-email every run (and get muted, protecting nobody) or need a separate table.
--
-- Idempotent; safe to re-run.

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS silence_alerted_at timestamptz NULL;

COMMENT ON COLUMN public.devices.silence_alerted_at IS
  'When the device-health cron last emailed about this device being silent. NULL = never alerted. Cleared on reconnect so a later outage alerts again.';

-- The cron scans active devices ordered by staleness; tiny table, but this keeps the
-- daily sweep an index scan rather than a seq scan as the fleet grows.
CREATE INDEX IF NOT EXISTS idx_devices_active_last_seen
  ON public.devices (org_id, last_seen_at)
  WHERE is_active;
