-- 076: physical work locations (multi-location attendance, Phase 0.A).
-- See docs/prds/multi-location-attendance.md §3.A. Inert until the zone feature wires it.
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_locations_org on public.locations (org_id);

alter table public.locations enable row level security;

drop policy if exists locations_admin_all on public.locations;
create policy locations_admin_all on public.locations
  for all to authenticated
  using (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'))
  with check (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'));
