-- 096_issued_documents.sql
-- Issued documents: one row per (template, employee) issuance. Holds the frozen
-- resolved variable values + rendered clause snapshot, the draft PDF path, and
-- the secure acknowledgement token that powers the public /documents/ack/[token]
-- flow. See docs/planning/documents-feature-plan.md §5.

create table if not exists public.issued_documents (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_templates(id),
  employee_id uuid not null references public.employees(id),
  issuing_entity_id uuid not null references public.organizations(id),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid references public.company_groups(id) on delete set null,
  -- snapshot of every {{variable}} resolved at send time
  resolved_values jsonb not null default '{}'::jsonb,
  -- frozen clause list actually issued (later template edits must not mutate this)
  rendered_body jsonb not null default '[]'::jsonb,
  draft_pdf_url text,                       -- storage path; regeneratable / MUTABLE
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','acknowledged','declined')),
  ack_token text,                           -- randomBytes(32) base64url; set at send
  ack_token_expires_at timestamptz,         -- lazy-expire like LOI
  decline_reason text,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_issued_documents_org on public.issued_documents(org_id);
create index if not exists idx_issued_documents_employee on public.issued_documents(employee_id);
create index if not exists idx_issued_documents_template on public.issued_documents(template_id);
create unique index if not exists uq_issued_ack_token
  on public.issued_documents(ack_token) where ack_token is not null;

alter table public.issued_documents enable row level security;

do $$ begin
  create policy issued_documents_select on public.issued_documents
    for select using (auth.jwt() ->> 'org_id' = org_id::text);
exception when duplicate_object then null; end $$;
