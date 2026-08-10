-- 103_leave_half_day.sql
-- Mobile Phase D Slice 2, Task 1: half-day leave columns.
-- Persists the WF-Request-Leave chip intent ("half-day start" / "half-day end")
-- on the leave request itself. NO AM/PM column -- each true flag subtracts 0.5
-- from the derived `days` total (see packages/shared/src/leaves/compute-days.ts).
-- Mobile-only write path for now (web UI unchanged; server derives `days` only
-- when these flags are present -- Task 2). Admin/web rendering of the flags is
-- a later task.
-- Spec: docs/superpowers/plans/2026-08-10-mobile-phase-d-slice2.md (Locked decisions)
-- Investigation: .superpowers/sdd/d2-investigation.md §2 ("Half-day mechanics")

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS start_half_day BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS end_half_day BOOLEAN NOT NULL DEFAULT false;
