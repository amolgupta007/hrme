-- 105_mobile_push_notifications.sql
-- Mobile Phase D Slice 3 Stage D — push notifications.
-- Two tables: push_tokens (one row per device/Expo token) and notifications
-- (the general in-app feed). RLS enabled but ADVISORY — all server access is
-- via the service-role admin client which bypasses RLS (gotcha #5). Policies
-- mirror the Clerk-JWT pattern used elsewhere and activate if/when JWT→RLS
-- wiring lands.

-- ── push_tokens ─────────────────────────────────────────────────────────────
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  clerk_user_id text not null,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_push_tokens_org_employee
  on public.push_tokens (org_id, employee_id);

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_owner_rw on public.push_tokens;
create policy push_tokens_owner_rw on public.push_tokens
  for all
  using (auth.jwt() ->> 'org_id' = org_id::text)
  with check (auth.jwt() ->> 'org_id' = org_id::text);

-- ── notifications (in-app feed) ─────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  type text not null check (type in ('leave_decision', 'payslip_paid', 'doc_ack', 'announcement')),
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_feed
  on public.notifications (org_id, employee_id, created_at desc);

create index if not exists idx_notifications_unread
  on public.notifications (org_id, employee_id)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_owner_read on public.notifications;
create policy notifications_owner_read on public.notifications
  for select
  using (auth.jwt() ->> 'org_id' = org_id::text);
