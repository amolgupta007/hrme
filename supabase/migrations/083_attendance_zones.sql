-- 080: attendance zones (multi-location attendance, Phase 1 — the headline feature).
-- A zone groups 1..N locations; an employee assigned to a zone has punches from any
-- device in those locations pooled into one daily record. See PRD §2.1 / §3.C.

create table if not exists public.attendance_zones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_attendance_zones_org on public.attendance_zones (org_id);

create table if not exists public.attendance_zone_locations (
  zone_id uuid not null references public.attendance_zones(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  primary key (zone_id, location_id)
);
create index if not exists idx_zone_locations_location on public.attendance_zone_locations (location_id);

-- Effective-dated employee -> zone assignment. Latest effective_from <= day wins.
create table if not exists public.employee_zone_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  zone_id uuid not null references public.attendance_zones(id) on delete cascade,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now()
);
create index if not exists idx_emp_zone_assign_lookup
  on public.employee_zone_assignments (org_id, employee_id, effective_from desc);

alter table public.attendance_zones enable row level security;
alter table public.attendance_zone_locations enable row level security;
alter table public.employee_zone_assignments enable row level security;

drop policy if exists attendance_zones_admin_all on public.attendance_zones;
create policy attendance_zones_admin_all on public.attendance_zones
  for all to authenticated
  using (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'))
  with check (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'));

drop policy if exists employee_zone_assignments_admin_all on public.employee_zone_assignments;
create policy employee_zone_assignments_admin_all on public.employee_zone_assignments
  for all to authenticated
  using (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'))
  with check (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'));

-- zone_locations has no org_id column; gate via the parent zone's org.
drop policy if exists attendance_zone_locations_admin_all on public.attendance_zone_locations;
create policy attendance_zone_locations_admin_all on public.attendance_zone_locations
  for all to authenticated
  using (exists (
    select 1 from public.attendance_zones z
    where z.id = zone_id
      and z.org_id::text = (auth.jwt() ->> 'org_id')
      and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin')
  ))
  with check (exists (
    select 1 from public.attendance_zones z
    where z.id = zone_id
      and z.org_id::text = (auth.jwt() ->> 'org_id')
      and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin')
  ));
