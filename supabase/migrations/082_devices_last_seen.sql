-- 079: device liveness for the self-serve connection-status indicator
-- (multi-location attendance — Settings "Biometric Devices" card).
-- last_seen_at  = any ADMS contact (handshake/poll/punch), throttled to ~1/min.
-- last_punch_at = most recent ATTLOG punch ingested from the device.
alter table public.devices add column if not exists last_seen_at timestamptz;
alter table public.devices add column if not exists last_punch_at timestamptz;
