-- 116_statutory_rules.sql
-- Payroll engine §4: statutory rules (EPF, ESI, PT, LWF, TDS) as versioned
-- data instead of code. Selection is by PAY MONTH: for month M the engine takes
-- the org's own rule if it has one, else the JambaHR global default, and within
-- that the newest version with effective_from_month <= M. For PT/LWF a rule for
-- the employee's state beats a state-less one.
--
-- params is validated by RULE_PARAM_SCHEMAS (@jambahr/shared/payroll/engine)
-- before any write. Every processed run also snapshots the params it used, so
-- editing a rule can never change a processed month.
--
-- Seed: the global rules below reproduce the constants that were hard-coded in
-- packages/shared/src/payroll/ctc.ts (EPF 12% on a ₹15,000 ceiling, the state PT
-- slabs, FY 2025-26 tax slabs). They are generated from LEGACY_GLOBAL_RULES so
-- the database and the parity-tested preset are identical. No ESI or LWF global
-- default is seeded — those were never implemented and are org-configured.
--
-- Additive and idempotent. RLS on, no policies (service role only).

create table if not exists public.statutory_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'org')),
  org_id uuid references public.organizations(id) on delete cascade,
  rule_key text not null check (rule_key in ('epf', 'esi', 'pt', 'lwf', 'tds')),
  jurisdiction text check (jurisdiction is null or jurisdiction = lower(trim(jurisdiction))),
  effective_from_month text not null
    check (effective_from_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  params jsonb not null check (jsonb_typeof(params) = 'object'),
  label text,
  notes text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((scope = 'global') = (org_id is null))
);

-- One version per (owner, rule, state, month).
create unique index if not exists uq_statutory_rules_version
  on public.statutory_rules (
    coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rule_key,
    coalesce(jurisdiction, ''),
    effective_from_month
  );

create index if not exists idx_statutory_rules_lookup
  on public.statutory_rules (rule_key, org_id, effective_from_month desc);

alter table public.statutory_rules enable row level security;

-- Global defaults = the previously hard-coded constants (generated from
-- LEGACY_GLOBAL_RULES). Re-running is a no-op.
insert into public.statutory_rules (scope, org_id, rule_key, jurisdiction, effective_from_month, params, label)
values
  ('global', null, 'epf', null, '2000-01', '{"eeRate":12,"erRate":12,"wageBase":["BASIC"],"wageCeiling":15000,"contributeAboveCeiling":false}'::jsonb, 'Legacy: epf'),
  ('global', null, 'tds', null, '2000-01', '{"cessPct":4,"regimes":{"new":{"slabs":[{"upTo":400000,"rate":0},{"upTo":800000,"rate":5},{"upTo":1200000,"rate":10},{"upTo":1600000,"rate":15},{"upTo":2000000,"rate":20},{"upTo":2400000,"rate":25},{"upTo":null,"rate":30}],"standardDeduction":75000,"rebateUpTo":1200000,"allowsDeclaredDeductions":false},"old":{"slabs":[{"upTo":250000,"rate":0},{"upTo":500000,"rate":5},{"upTo":1000000,"rate":20},{"upTo":null,"rate":30}],"standardDeduction":50000,"rebateUpTo":500000,"allowsDeclaredDeductions":true}}}'::jsonb, 'Legacy: tds'),
  ('global', null, 'pt', 'maharashtra', '2000-01', '{"measure":"earned_gross","slabs":[{"below":10001,"amount":0},{"below":15001,"amount":150},{"below":null,"amount":200}]}'::jsonb, 'Legacy: pt-maharashtra'),
  ('global', null, 'pt', 'karnataka', '2000-01', '{"measure":"earned_gross","slabs":[{"below":15001,"amount":0},{"below":null,"amount":200}]}'::jsonb, 'Legacy: pt-karnataka'),
  ('global', null, 'pt', 'telangana', '2000-01', '{"measure":"earned_gross","slabs":[{"below":15001,"amount":0},{"below":null,"amount":200}]}'::jsonb, 'Legacy: pt-telangana'),
  ('global', null, 'pt', 'andhra pradesh', '2000-01', '{"measure":"earned_gross","slabs":[{"below":15001,"amount":0},{"below":null,"amount":200}]}'::jsonb, 'Legacy: pt-andhra-pradesh'),
  ('global', null, 'pt', 'gujarat', '2000-01', '{"measure":"earned_gross","slabs":[{"below":6001,"amount":0},{"below":null,"amount":200}]}'::jsonb, 'Legacy: pt-gujarat'),
  ('global', null, 'pt', 'tamil nadu', '2000-01', '{"measure":"earned_gross","slabs":[{"below":21001,"amount":0},{"below":null,"amount":182}]}'::jsonb, 'Legacy: pt-tamil-nadu'),
  ('global', null, 'pt', 'west bengal', '2000-01', '{"measure":"earned_gross","slabs":[{"below":10001,"amount":0},{"below":15001,"amount":110},{"below":25001,"amount":130},{"below":40001,"amount":150},{"below":null,"amount":200}]}'::jsonb, 'Legacy: pt-west-bengal'),
  ('global', null, 'pt', 'delhi', '2000-01', '{"measure":"earned_gross","slabs":[{"below":null,"amount":0}]}'::jsonb, 'Legacy: pt-delhi'),
  ('global', null, 'pt', 'haryana', '2000-01', '{"measure":"earned_gross","slabs":[{"below":null,"amount":0}]}'::jsonb, 'Legacy: pt-haryana'),
  ('global', null, 'pt', 'rajasthan', '2000-01', '{"measure":"earned_gross","slabs":[{"below":null,"amount":0}]}'::jsonb, 'Legacy: pt-rajasthan'),
  ('global', null, 'pt', 'uttar pradesh', '2000-01', '{"measure":"earned_gross","slabs":[{"below":null,"amount":0}]}'::jsonb, 'Legacy: pt-uttar-pradesh'),
  ('global', null, 'pt', null, '2000-01', '{"measure":"earned_gross","slabs":[{"below":10001,"amount":0},{"below":null,"amount":200}]}'::jsonb, 'Legacy: pt-default')

on conflict do nothing;
