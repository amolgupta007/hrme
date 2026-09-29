-- 109_announcement_acknowledgements.sql
-- Announcements: category (the column the dashboard + mobile Home always
-- assumed existed), audience targeting, required acknowledgement with content
-- versioning, a publish-time recipient snapshot, and an append-only
-- acknowledgement log.
--
-- RLS is enabled but ADVISORY — every server action uses the service-role
-- client, which bypasses RLS (gotcha #5). Tenant isolation is enforced in the
-- actions (org_id filter + role checks). Immutability of acknowledgements is
-- enforced by a TRIGGER, because a trigger (unlike a policy) also binds the
-- service role.
--
-- Idempotent.

-- ── announcements: new columns ──────────────────────────────────────────────
alter table public.announcements
  add column if not exists category text not null default 'general'
    check (category in ('general', 'policy', 'event', 'urgent')),
  add column if not exists audience_type text not null default 'all'
    check (audience_type in ('all', 'targeted')),
  add column if not exists ack_required boolean not null default false,
  add column if not exists ack_due_date date,
  -- content_version bumps on every title/body edit; ack_version is the version
  -- recipients must have acknowledged (bumps only on a "require re-ack" edit).
  add column if not exists content_version integer not null default 1,
  add column if not exists ack_version integer not null default 1,
  -- Ack-required announcements that have acknowledgements are archived, never
  -- hard-deleted, so the audit trail survives.
  add column if not exists archived_at timestamptz;

create index if not exists idx_announcements_org_feed
  on public.announcements (org_id, is_pinned desc, created_at desc)
  where archived_at is null;

-- updated_at never moved on edit: the trigger was never created for this table.
drop trigger if exists update_announcements_updated_at on public.announcements;
create trigger update_announcements_updated_at
  before update on public.announcements
  for each row execute function public.update_updated_at_column();

-- ── announcement_versions: exactly what each version said ───────────────────
create table if not exists public.announcement_versions (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  version integer not null,
  title text not null,
  body text not null,
  requires_reack boolean not null default false,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (announcement_id, version)
);

-- Backfill v1 for existing announcements.
insert into public.announcement_versions (announcement_id, org_id, version, title, body, created_by, created_at)
select a.id, a.org_id, 1, a.title, a.body, a.created_by, a.created_at
from public.announcements a
on conflict (announcement_id, version) do nothing;

-- ── announcement_targets: departments ∪ employees (mirrors late_policy_targets)
create table if not exists public.announcement_targets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  target_type text not null check (target_type in ('department', 'employee')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (announcement_id, target_type, target_id)
);

create index if not exists idx_announcement_targets_org
  on public.announcement_targets (org_id, target_type, target_id);

-- ── announcement_recipients: audience frozen at publish time ────────────────
create table if not exists public.announcement_recipients (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  added_reason text not null default 'publish' check (added_reason in ('publish', 'late_add')),
  last_reminded_at timestamptz,
  reminder_count integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (announcement_id, employee_id)
);

create index if not exists idx_announcement_recipients_employee
  on public.announcement_recipients (org_id, employee_id);

-- ── announcement_acknowledgements: append-only audit log ────────────────────
create table if not exists public.announcement_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  version integer not null,
  acknowledged_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  unique (announcement_id, employee_id, version)
);

create index if not exists idx_announcement_acks_lookup
  on public.announcement_acknowledgements (announcement_id, version);
create index if not exists idx_announcement_acks_employee
  on public.announcement_acknowledgements (org_id, employee_id);

-- UPDATE is always rejected. DELETE is rejected while the row's parents still
-- exist — i.e. direct tampering is blocked, but a lifecycle cascade (org
-- deletion, employee deletion, hard-deleting an announcement) can still purge.
-- Cascades run after the parent row is gone, so the parent lookups miss.
create or replace function public.announcement_ack_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'announcement_acknowledgements is append-only';
  end if;
  if exists (select 1 from public.announcements where id = old.announcement_id)
     and exists (select 1 from public.employees where id = old.employee_id)
     and exists (select 1 from public.organizations where id = old.org_id) then
    raise exception 'announcement_acknowledgements is append-only';
  end if;
  return old;
end;
$$;

drop trigger if exists announcement_ack_immutable on public.announcement_acknowledgements;
create trigger announcement_ack_immutable
  before update or delete on public.announcement_acknowledgements
  for each row execute function public.announcement_ack_guard();

-- ── RLS (advisory; Clerk-JWT pattern as in 105) ─────────────────────────────
alter table public.announcement_versions enable row level security;
alter table public.announcement_targets enable row level security;
alter table public.announcement_recipients enable row level security;
alter table public.announcement_acknowledgements enable row level security;

drop policy if exists announcement_versions_org_read on public.announcement_versions;
create policy announcement_versions_org_read on public.announcement_versions
  for select using (auth.jwt() ->> 'org_id' = org_id::text);

drop policy if exists announcement_targets_org_read on public.announcement_targets;
create policy announcement_targets_org_read on public.announcement_targets
  for select using (auth.jwt() ->> 'org_id' = org_id::text);

drop policy if exists announcement_recipients_org_read on public.announcement_recipients;
create policy announcement_recipients_org_read on public.announcement_recipients
  for select using (auth.jwt() ->> 'org_id' = org_id::text);

-- Read + insert only. No UPDATE/DELETE policy exists, by design.
drop policy if exists announcement_acks_org_read on public.announcement_acknowledgements;
create policy announcement_acks_org_read on public.announcement_acknowledgements
  for select using (auth.jwt() ->> 'org_id' = org_id::text);

drop policy if exists announcement_acks_org_insert on public.announcement_acknowledgements;
create policy announcement_acks_org_insert on public.announcement_acknowledgements
  for insert with check (auth.jwt() ->> 'org_id' = org_id::text);
