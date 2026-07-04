-- 097_signed_records.sql
-- Append-only audit of acknowledged documents. One row per successful typed-ack
-- (or, later, Aadhaar eSign / DSC). signed_pdf_url points at an IMMUTABLE object
-- written once and never overwritten. Owner/admin read-only; no UPDATE/DELETE for
-- anyone (append-only). Employees never write this table directly — the public
-- acknowledgeIssuedDocument server action inserts via the service role.
-- See docs/planning/documents-feature-plan.md §2/§3/§6.

create table if not exists public.signed_records (
  id uuid primary key default gen_random_uuid(),
  issued_document_id uuid not null references public.issued_documents(id),
  employee_id uuid not null references public.employees(id),
  issuing_entity_id uuid not null references public.organizations(id),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid references public.company_groups(id) on delete set null,
  signed_pdf_url text not null,             -- immutable storage path
  signer_name text not null,                -- typed confirmation
  signer_ip text,
  user_agent text,
  acknowledgement_text text not null,       -- frozen copy of the statement shown
  acknowledged_at timestamptz not null default now(),
  -- eSign extensibility (P1 always 'typed_ack'); NO schema change needed for P2
  signature_method text not null default 'typed_ack'
    check (signature_method in ('typed_ack','aadhaar_esign','dsc')),
  esign_provider text,
  esign_transaction_id text,
  esign_certificate_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_signed_records_org on public.signed_records(org_id);
create index if not exists idx_signed_records_issued on public.signed_records(issued_document_id);
create index if not exists idx_signed_records_employee on public.signed_records(employee_id);

alter table public.signed_records enable row level security;

-- SELECT: owner/admin within the org only (advisory; real gate is isAdmin() in
-- the server action over the service-role client).
do $$ begin
  create policy signed_records_select on public.signed_records
    for select using (
      auth.jwt() ->> 'org_id' = org_id::text
      and coalesce(auth.jwt() ->> 'org_role', '') in ('org:owner','org:admin')
    );
exception when duplicate_object then null; end $$;

-- Deliberately NO insert/update/delete policy → append-only under any future
-- JWT enforcement. Inserts happen only via the service-role client.
