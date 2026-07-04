-- 095_document_templates_core.sql
-- Offer Letter & Document Templating System (Phase 1) — core template tables.
-- Tenancy reconciliation (see docs/planning/documents-feature-plan.md):
--   * org_id  = the entity that created the template (always set; drives the
--               real .eq("org_id") app-layer scope filter).
--   * group_id = nullable; stamped from getOrgGroupId(org_id) at create time.
--               When set, the template is readable across the whole company_group
--               (multi-entity issuance). Null = single-org scope.
-- RLS is advisory only — the app enforces isolation via the service-role client
-- + explicit filters (CLAUDE.md gotcha #5). Policies mirror 009/018/092 style.

-- ─────────────────────────────────────────────────────────────────────────────
-- document_templates
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid references public.company_groups(id) on delete set null,
  name text not null,
  type text not null default 'offer_letter'
    check (type in ('offer_letter','nda','policy')),
  body_structure jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft','active','archived')),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_document_templates_org on public.document_templates(org_id);
create index if not exists idx_document_templates_group on public.document_templates(group_id) where group_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- document_clauses (ordered clause rows belonging to a template)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.document_clauses (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_templates(id) on delete cascade,
  order_index int not null default 0,
  title text not null,
  body_markdown text not null default '',
  is_mandatory boolean not null default false,
  category text not null default 'custom'
    check (category in ('behavior','compliance','confidentiality','comp','custom')),
  created_at timestamptz not null default now()
);
create index if not exists idx_document_clauses_template on public.document_clauses(template_id, order_index);

-- ─────────────────────────────────────────────────────────────────────────────
-- clause_library (reusable clauses; org_id null = system default, shared to all)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.clause_library (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  group_id uuid references public.company_groups(id) on delete set null,
  title text not null,
  body_markdown text not null default '',
  category text not null default 'custom'
    check (category in ('behavior','compliance','confidentiality','comp','custom')),
  is_system_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_clause_library_org on public.clause_library(org_id);
create index if not exists idx_clause_library_group on public.clause_library(group_id) where group_id is not null;
create index if not exists idx_clause_library_system on public.clause_library(is_system_default) where is_system_default = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- document_variables (declared placeholder registry; validated against {{tokens}})
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.document_variables (
  key text primary key,
  label text not null,
  source text not null default 'manual'
    check (source in ('employee','salary_structure','issuing_entity','group','manual'))
);

insert into public.document_variables (key, label, source) values
  ('employee_name',          'Employee full name',        'employee'),
  ('designation',            'Designation / job title',   'employee'),
  ('department',             'Department',                'employee'),
  ('employment_type',        'Employment type',           'employee'),
  ('joining_date',           'Date of joining',           'employee'),
  ('employee_email',         'Employee email',            'employee'),
  ('ctc',                    'Annual CTC',                'salary_structure'),
  ('issuing_entity_name',    'Issuing entity legal name', 'issuing_entity'),
  ('issuing_entity_address', 'Issuing entity address',    'issuing_entity'),
  ('group_name',             'Company group name',        'group'),
  ('today',                  'Current date',              'manual')
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS (advisory; service-role bypasses)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.document_templates enable row level security;
alter table public.document_clauses enable row level security;
alter table public.clause_library enable row level security;
alter table public.document_variables enable row level security;

do $$ begin
  create policy document_templates_select on public.document_templates
    for select using (auth.jwt() ->> 'org_id' = org_id::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy document_clauses_select on public.document_clauses
    for select using (
      exists (
        select 1 from public.document_templates t
        where t.id = template_id and auth.jwt() ->> 'org_id' = t.org_id::text
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy clause_library_select on public.clause_library
    for select using (is_system_default or auth.jwt() ->> 'org_id' = org_id::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy document_variables_select on public.document_variables
    for select using (true);
exception when duplicate_object then null; end $$;
