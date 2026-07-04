# FEATURE: Offer Letter & Document Templating System (Group-Scoped, e-Ack in P1)

## CONTEXT
JambaHR — multi-tenant B2B HR SaaS (Next.js 14 App Router, Supabase + RLS,
Clerk Organizations, Tailwind, shadcn/ui, Resend). Target: Indian SMBs, many of
which run a GROUP of legal entities. First-time onboarding clients need to (a)
build a clause-based offer letter template fast (AI-assisted first draft), and
(b) issue it to many employees, swapping only per-employee variables.

## LOCKED DECISIONS
1. Templates are GROUP-SCOPED. One template is shared across all entities in the
   group; the ISSUING ENTITY is chosen at issuance time (runtime variable).
2. Phase 1 ships e-ACKNOWLEDGEMENT + PDF (typed-name acknowledgement, NOT a
   certified e-signature).
3. After the employee acknowledges, the signed metadata + final PDF live in a
   "SIGNED RECORDS" section, visible ONLY to owner + admin roles.
4. Aadhaar eSign / DSC are OUT of Phase 1, but the schema and signing flow MUST
   be designed as pluggable so a certified-signature provider can be added later
   without re-architecting. (See "eSign extensibility" below.)

## MODE: INVESTIGATION-FIRST — do NOT write code yet. Report findings, then STOP.

## PHASE 0 — INVESTIGATION (report findings)
1. Group/entity modeling: how is a "group of legal entities" represented today?
   (Cross-org attendance work implies partial group modeling — reconcile, do NOT
   duplicate.) Identify the canonical group_id and entity_id columns.
2. Clerk org_id → JWT → RLS flow: confirm whether org_id maps to a single entity
   or a group, and how to scope reads to "all entities in my group."
3. Employee table shape (name, designation, CTC, joining_date, entity linkage).
4. Existing AI infra (Anthropic tool-calling assistant, pgvector) reusable for
   clause generation.
5. Supabase Storage config + any existing PDF generation. Resend setup.
6. Existing role model (owner/admin/…): exact role values for RLS gating of
   Signed Records.

## DATA MODEL
- `document_templates` (id, group_id, name, type[offer_letter|nda|policy],
  body_structure JSONB, status[draft|active|archived], created_by, timestamps)
  → scoped to group_id; readable by all entities in the group.
- `clause_library` (id, group_id NULLABLE for system defaults, title,
  body_markdown, category[behavior|compliance|confidentiality|comp|custom],
  is_system_default)
- `document_clauses` (id, template_id, order_index, title, body_markdown,
  is_mandatory, category)
- `document_variables` (declared placeholders: employee_name, designation, ctc,
  joining_date, issuing_entity_name, issuing_entity_address, group_name, …)
- `issued_documents` (id, template_id, employee_id, issuing_entity_id, group_id,
  resolved_values JSONB, draft_pdf_url,
  status[draft|sent|viewed|acknowledged|declined], sent_at, viewed_at,
  created_by)
- `signed_records` (id, issued_document_id, employee_id, issuing_entity_id,
  group_id, signed_pdf_url, signer_name, signer_ip, user_agent,
  acknowledgement_text, acknowledged_at, immutable=true,
  -- eSign extensibility hooks (P1 always 'typed_ack'):
  signature_method enum[typed_ack | aadhaar_esign | dsc] DEFAULT 'typed_ack',
  esign_provider TEXT NULLABLE,          -- e.g. 'digio' | 'leegality' | null
  esign_transaction_id TEXT NULLABLE,
  esign_certificate_url TEXT NULLABLE)
  → separate table so it can be locked down and treated as an audit record.

## RLS
- Templates / clause_library / issued_documents: scoped to group_id via Clerk
  JWT. Group-shared reads; issuance stamps issuing_entity_id.
- signed_records: SELECT restricted to owner + admin roles within the group
  ONLY. No UPDATE/DELETE for anyone (append-only audit). Employee can INSERT
  their own acknowledgement via a controlled server action, not a direct table
  write.

## BUILD SCOPE (Phase 1)
### 1. Template builder
Clause-based editor (add/reorder/remove, drag), pull from clause_library, mark
mandatory, markdown body. `{{variable}}` placeholders validated against declared
variables. Live preview with sample data. Category-grouped clause picker.

### 2. AI-assisted first draft (reuse Anthropic infra)
"Generate offer letter" → input: company/group profile, role, industry, optional
pasted clauses → output: STRUCTURED clause list (JSON), mapped into the builder,
NOT free text. Indian-context defaults (probation, notice period, confidentiality,
code of conduct, PF/ESI where relevant), every clause editable/removable. AI
output lands as an editable DRAFT — never auto-active. Human-in-the-loop.

### 3. Issuance (one template → many employees)
Multi-select employees + choose ISSUING ENTITY (group entity dropdown).
Per-employee variables auto-filled from employee record, overridable inline.
Bulk resolve → render draft PDF → store in Supabase Storage → preview each →
bulk send.

### 4. e-Acknowledgement flow
Employee opens a secure token-scoped link → views resolved document → clicks
Accept. Capture: signer name (typed confirmation), timestamp, IP, user-agent,
and a fixed acknowledgement statement. The statement wording MUST make clear
this is an acknowledgement of receipt/agreement, NOT a digitally certified
signature. On accept:
  - render FINAL signed PDF (embeds acknowledgement block: name, timestamp, IP),
  - write immutable row to `signed_records` (signature_method='typed_ack'),
  - update issued_documents.status = acknowledged.
Decline path captured too (status=declined, reason optional).

### 5. Signed Records section (owner/admin only)
New route/section listing signed_records for the group: employee, issuing entity,
template, acknowledged_at, signature_method, download signed PDF, view captured
audit metadata. Filter by entity, template, date. RLS + UI both gate to
owner/admin.

## eSIGN EXTENSIBILITY (design now, build later — Phase 2)
- Model the act of "finalizing a signature" behind a provider interface, e.g.
  `SignatureProvider.finalize(issuedDocumentId, context) -> SignedResult`.
  P1 has a single `TypedAckProvider` implementation.
- Phase 2 adds an ESP-aggregator adapter (Digio / Leegality preferred — they
  abstract ESP empanelment and expose one API for Aadhaar eSign). New adapter
  populates esign_provider / esign_transaction_id / esign_certificate_url and
  sets signature_method='aadhaar_esign'. NO schema change should be required.
- DSC is explicitly NOT planned for offer letters (token-bound, per-individual,
  ill-suited to bulk remote issuance) — keep the enum value for completeness only.

## OUT OF SCOPE (P1)
Aadhaar eSign / DSC signing, template version diffing, conditional clauses,
multi-signer approval chains.

## DELIVERABLE FROM YOU NOW
Written plan: schema DDL sketch, RLS policy approach for (a) group-shared
templates and (b) owner/admin-only append-only signed_records, the AI clause
JSON contract (input/output shape), the secure acknowledgement-link token
design, the SignatureProvider interface, and the PDF-rendering recommendation
(Vercel-serverless compatible; note WSL/Windows dev constraints; draft vs final
signed PDF are distinct artifacts, only the signed PDF is immutable in Storage).
Then STOP for my approval.
