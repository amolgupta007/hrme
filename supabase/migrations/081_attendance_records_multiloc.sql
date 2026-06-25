-- 081: multi-location rollup fields on attendance_records (Phase 2).
-- Derived by computeDailyAttendance() from attendance_punch_events; additive + nullable
-- so the single-pair / web punch flow is untouched (these stay null there).
alter table public.attendance_records add column if not exists first_in_location_id uuid references public.locations(id) on delete set null;
alter table public.attendance_records add column if not exists last_out_location_id uuid references public.locations(id) on delete set null;
alter table public.attendance_records add column if not exists punch_count integer;
alter table public.attendance_records add column if not exists out_of_zone_count integer;
-- derived presence from the event stream: present | incomplete (single punch) | absent
alter table public.attendance_records add column if not exists derived_status text
  check (derived_status in ('present','incomplete','absent'));
