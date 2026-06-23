-- 078: neutral punch-event log (multi-location attendance, Phase 0.B).
-- attendance_records is UNIQUE(org_id, employee_id, date) — a single in/out pair
-- that CANNOT hold a multi-punch stream. Events live here; the daily rollup in
-- attendance_records is DERIVED from them via computeDailyAttendance().
-- See docs/prds/multi-location-attendance.md §3.B + §4.2. Inert until wired.
create table if not exists public.attendance_punch_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,     -- null = web/manual
  location_id uuid references public.locations(id) on delete set null,
  punched_at timestamptz not null,
  source text not null default 'device' check (source in ('web','device','manual','adms')),
  raw_payload jsonb,                                                    -- audit: exact device push
  created_at timestamptz not null default now()
);

create index if not exists idx_punch_events_emp_time on public.attendance_punch_events (org_id, employee_id, punched_at);
create index if not exists idx_punch_events_device on public.attendance_punch_events (device_id);

alter table public.attendance_punch_events enable row level security;

drop policy if exists punch_events_admin_all on public.attendance_punch_events;
create policy punch_events_admin_all on public.attendance_punch_events
  for all to authenticated
  using (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'))
  with check (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'));
