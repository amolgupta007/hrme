-- 077: biometric device registry (multi-location attendance, Phase 0.A).
-- Gives identity to the free-text attendance_records.device_id + a home location.
-- See docs/prds/multi-location-attendance.md §3.A. Inert until wired.
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  device_serial text not null,   -- the eSSL/ZKTeco serial the device pushes
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, device_serial)
);

create index if not exists idx_devices_org on public.devices (org_id);
create index if not exists idx_devices_location on public.devices (location_id);

alter table public.devices enable row level security;

drop policy if exists devices_admin_all on public.devices;
create policy devices_admin_all on public.devices
  for all to authenticated
  using (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'))
  with check (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'));
