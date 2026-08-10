-- 102_mobile_punch_support.sql
-- Mobile Phase D Slice 1, Task 1: punch-event mobile support.
-- Adds 'mobile' as an allowed attendance_punch_events.source (and attendance_records.source,
-- for the rollup writer that stamps mobile-only days -- Task 3), plus offline-replay
-- idempotency (client_event_id) and optional coarse GPS (lat/lng) columns.
-- Spec: docs/prds/mobile/02-PRD-Staff-MVP.md + docs/prds/mobile/PRD-addendum-mobile-data-layer.md
-- Decision record: docs/prds/mobile/02A-PHASE-D-DECISIONS.md

-- Live constraint names + defs confirmed 2026-07-17 via:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = '<table>'::regclass AND contype = 'c';
-- BEFORE:
--   attendance_punch_events_source_check: CHECK (source = ANY (ARRAY['web','device','manual','adms']))
--   attendance_records_source_check:      CHECK (source = ANY (ARRAY['web','device','auto_close']))
-- AFTER (this migration):
--   attendance_punch_events_source_check: CHECK (source = ANY (ARRAY['web','device','manual','adms','mobile']))
--   attendance_records_source_check:      CHECK (source = ANY (ARRAY['web','device','auto_close','mobile']))
-- (attendance_punch_events also carries punch_events_status_check / punch_events_type_check,
-- from later migrations 086/087 -- untouched here.)

ALTER TABLE public.attendance_punch_events
  DROP CONSTRAINT IF EXISTS attendance_punch_events_source_check;
ALTER TABLE public.attendance_punch_events
  ADD CONSTRAINT attendance_punch_events_source_check
  CHECK (source = ANY (ARRAY['web'::text, 'device'::text, 'manual'::text, 'adms'::text, 'mobile'::text]));

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_source_check;
ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_source_check
  CHECK (source = ANY (ARRAY['web'::text, 'device'::text, 'auto_close'::text, 'mobile'::text]));

-- Offline-replay idempotency key. Stronger than the punched_at collision dedupe index
-- uq_punch_events_dedupe (migration 078): the mobile client mints this UUID client-side
-- before queueing an offline punch, so a replayed insert conflicts deterministically
-- instead of relying on timestamp equality with a null device_id.
ALTER TABLE public.attendance_punch_events
  ADD COLUMN IF NOT EXISTS client_event_id uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_punch_events_client_event
  ON public.attendance_punch_events (org_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

-- Optional coarse GPS (PRD-addendum-mobile-data-layer.md S2.2). Nullable; capture is
-- org-flag-gated later (Task 3+). Columns added now to avoid a second migration.
ALTER TABLE public.attendance_punch_events
  ADD COLUMN IF NOT EXISTS lat double precision NULL;
ALTER TABLE public.attendance_punch_events
  ADD COLUMN IF NOT EXISTS lng double precision NULL;
