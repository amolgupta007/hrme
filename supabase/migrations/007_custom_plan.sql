-- Phase 3 — Custom plan support
-- Idempotent: safe to run on prod even if some columns/tables already exist from Phase 1's SQL Editor migration.
-- Run via Supabase Dashboard → SQL Editor (Windows can't use the CLI).

-- ── 1. Custom plan columns on organizations ─────────────────────────────
alter table organizations
  add column if not exists custom_features        jsonb,
  add column if not exists custom_per_feature_rate integer,
  add column if not exists custom_platform_fee    integer,
  add column if not exists custom_max_employees   integer;

-- Backfill: ensure plan check constraint allows 'custom'
alter table organizations drop constraint if exists organizations_plan_check;
alter table organizations
  add constraint organizations_plan_check
  check (plan in ('starter','growth','business','custom'));

-- ── 2. custom_plan_requests table ───────────────────────────────────────
create table if not exists custom_plan_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  requested_by_employee_id uuid references employees(id) on delete set null,
  requested_features jsonb not null,
  requested_employees integer not null check (requested_employees >= 1),
  requested_billing_cycle text not null check (requested_billing_cycle in ('monthly','annual')),
  status text not null default 'pending'
    check (status in ('pending','counter_offered','accepted','rejected','approved','cancelled')),
  founder_platform_fee     integer,
  founder_per_feature_rate integer,
  founder_max_employees    integer,
  founder_notes            text,
  rejection_reason         text,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  activated_at timestamptz
);

create index if not exists idx_custom_plan_requests_org_status
  on custom_plan_requests (org_id, status);

create index if not exists idx_custom_plan_requests_status_pending
  on custom_plan_requests (created_at desc)
  where status in ('pending','counter_offered','accepted');

-- ── 3. webhook_events table (idempotency for Razorpay retries) ──────────
create table if not exists webhook_events (
  id          text primary key,
  event_type  text not null,
  processed_at timestamptz not null default now()
);

-- ── 4. RLS ──────────────────────────────────────────────────────────────
alter table custom_plan_requests enable row level security;
alter table webhook_events enable row level security;
-- No policies needed: server actions use the admin client (service role) which bypasses RLS.
