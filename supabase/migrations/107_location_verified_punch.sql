-- 107_location_verified_punch.sql
-- Mobile D5: Location-verified clock-in.
--
-- Two additions:
--   1. `locations` (the office-sites table from migration 076, currently address-only)
--      gains a geofence: lat/lng + an optional per-site radius override. A location with
--      coordinates becomes an office geofence for mobile punches. This is the right home --
--      `locations` already anchors biometric devices (077) and attendance zones (083), so
--      one office row now serves devices AND mobile geofencing.
--   2. `attendance_punch_events` gains the SERVER-RESOLVED verdict for a mobile punch.
--      lat/lng already exist (migration 102); what was missing is what we concluded from
--      them. The client never sends `geo_status` -- it is resolved server-side from the
--      org's geofences, so a client can never claim "I was at the office".
--
-- Plan: docs/superpowers/plans/2026-08-12-mobile-d5-geo-punch-and-prd-04-05.md
-- Idempotent; safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Office geofences on `locations`
-- ---------------------------------------------------------------------------

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS lat double precision NULL;
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS lng double precision NULL;

-- NULL radius = fall back to the org default
-- (organizations.settings.attendance.location_punch.default_radius_m).
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS geofence_radius_m integer NULL;

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_geofence_radius_check;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_geofence_radius_check
  CHECK (geofence_radius_m IS NULL OR (geofence_radius_m >= 25 AND geofence_radius_m <= 20000));

-- Coordinates are all-or-nothing: a half-set pin would silently never match.
ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_latlng_paired_check;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_latlng_paired_check
  CHECK ((lat IS NULL AND lng IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL));

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_latlng_range_check;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_latlng_range_check
  CHECK (
    (lat IS NULL AND lng IS NULL)
    OR (lat >= -90 AND lat <= 90 AND lng >= -180 AND lng <= 180)
  );

-- The punch path loads "every geofenced site in this org" on each verified punch.
CREATE INDEX IF NOT EXISTS idx_locations_org_geofenced
  ON public.locations (org_id)
  WHERE lat IS NOT NULL AND is_active;

-- ---------------------------------------------------------------------------
-- 2. Resolved geo verdict on `attendance_punch_events`
-- ---------------------------------------------------------------------------

-- GPS accuracy radius (metres) the device reported alongside the fix. Used by the
-- geofence match to give a low-confidence fix the benefit of the doubt (capped),
-- and kept for audit ("why was this marked remote?").
ALTER TABLE public.attendance_punch_events
  ADD COLUMN IF NOT EXISTS accuracy_m double precision NULL;

-- NULL = not evaluated (feature off, no coordinates, or resolution failed).
-- Deliberately NOT defaulted: "we don't know" must stay distinct from "remote".
ALTER TABLE public.attendance_punch_events
  ADD COLUMN IF NOT EXISTS geo_status text NULL;

ALTER TABLE public.attendance_punch_events
  DROP CONSTRAINT IF EXISTS attendance_punch_events_geo_status_check;
ALTER TABLE public.attendance_punch_events
  ADD CONSTRAINT attendance_punch_events_geo_status_check
  CHECK (geo_status IS NULL OR geo_status = ANY (ARRAY['office'::text, 'remote'::text]));

-- Which office geofence matched (NULL when remote / unevaluated). ON DELETE SET NULL:
-- deleting an office must never delete attendance history.
ALTER TABLE public.attendance_punch_events
  ADD COLUMN IF NOT EXISTS matched_location_id uuid NULL
  REFERENCES public.locations(id) ON DELETE SET NULL;

-- Human-readable place: the office name when `office`, the reverse-geocoded
-- "locality, city" when `remote`. NULL when geocoding was unavailable -- the punch
-- is still recorded and still labelled `remote`.
ALTER TABLE public.attendance_punch_events
  ADD COLUMN IF NOT EXISTS geo_label text NULL;

-- Partial: only a small slice of punches carry a verdict (mobile + feature on).
CREATE INDEX IF NOT EXISTS idx_punch_events_geo_status
  ON public.attendance_punch_events (org_id, geo_status)
  WHERE geo_status IS NOT NULL;

COMMENT ON COLUMN public.attendance_punch_events.geo_status IS
  'Server-resolved location verdict for a mobile punch: office | remote | NULL (not evaluated). Never client-supplied.';
COMMENT ON COLUMN public.locations.geofence_radius_m IS
  'Per-site geofence radius in metres. NULL falls back to organizations.settings.attendance.location_punch.default_radius_m.';
