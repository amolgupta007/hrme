# Offer Letter & Document Templating — Operator / Dev Guide

Shipped 2026-07-04 (merged to `main` `68fc264`). Business tier. Spec: `docs/prds/documents-feature.md`. Design + tenancy reconciliation: `docs/planning/documents-feature-plan.md`. CLAUDE.md has the condensed module section.

## What it does
Build clause-based **offer letter / NDA / policy** templates once, issue them to many employees swapping only per-person `{{variables}}`, collect a typed-name **e-acknowledgement**, and keep an append-only **signed-records** audit trail.

> The acknowledgement is an electronic record of receipt + agreement, **not** a certified / Aadhaar-based e-signature. Aadhaar eSign (Digio/Leegality) is Phase 2 and plugs into the same `signed_records` row via the `esign_*` columns — no schema change.

## How to enable for an org
Plan-based only — no per-org toggle. The org must be on **Business** tier (`document_templating` feature key in `src/config/plans.ts`). Then admins see the **"Offer letters & document templating"** entry card inside **Dashboard → Documents** (not a sidebar item — it's occasional-use).

```sql
update organizations set plan = 'business' where id = '<org-uuid>';
```

## Admin flow
1. **Documents tab → the entry card → Templates.**
2. **New template** → name + type. Add clauses via **Add clause** / **From library** (11 seeded Indian-context clauses) / **Generate with AI** (Sonnet 4.6, ~₹3.5/generation, lands as an editable draft — never auto-active). Drag to reorder; mark mandatory. Use `{{variables}}` (`{{employee_name}}`, `{{designation}}`, `{{ctc}}`, `{{joining_date}}`, `{{issuing_entity_name}}`, …). **Save & activate** (activation validates every placeholder against `document_variables`).
3. **Issue tab** → pick an active template + issuing entity → select employees → preview (variables auto-fill from the employee record + salary structure; edit inline; `[token]` means unresolved) → **Send** (mints a `randomBytes(32)` token, 30-day expiry, emails each employee).
4. Employee opens `/documents/ack/[token]` (public, no auth) → reviews → types name → acknowledges. Captures IP + user-agent. Renders the immutable signed PDF, writes the `signed_records` row, notifies admins.
5. **Signed Records tab** (owner/admin only) → track issued-doc status + download signed PDFs (append-only audit).

## Group scoping
Reconciled to the real tenancy model (Clerk decoupled; group = superadmin overlay `company_groups`): every table carries `org_id` + a **nullable `group_id`** (stamped from `getOrgGroupId`). `resolveDocScope` (`src/lib/documents/scope.ts`) spans the whole group when the org is grouped (multi-entity issuing dropdown), else single-org. Multi-entity issuing only lights up for orgs a superadmin placed in a `company_group` — same model as multi-location attendance.

## Architecture map
- **Migrations** `095`–`098` (applied live): templates/clauses/clause_library/document_variables, issued_documents (+`ack_token`), signed_records (append-only, no UPDATE/DELETE policy), seed clauses.
- **Lib** `src/lib/documents/`: `scope.ts`, `variables.ts` (resolve + `applyVariables` + placeholder validation), `markdown.ts` (subset parser shared by PDF + on-screen view), `pdf.tsx` (`@react-pdf/renderer`, pure-Node), `generate-clauses.ts` (AI, `max_tokens: 16000`), `signature/` (`SignatureProvider` + `TypedAckProvider`), `storage.ts` (draft mutable / signed immutable in the `documents` bucket), `acknowledgement.ts`, `title.ts`.
- **Actions** `src/actions/documents-templating.ts` (admin CRUD/issue + public ack/decline + owner/admin signed records).
- **UI** `src/app/dashboard/documents/{templates,issue,signed}` + `templates/new` + `templates/[id]`, public `src/app/documents/ack/[token]`, components in `src/components/documents/`.
- **Email** `src/components/emails/document-issued.tsx`. **Help** 3 articles + 5 route-registry entries.

## Gotchas
- `@react-pdf/renderer` is in `serverComponentsExternalPackages` (next.config.js) — required.
- AI generation needs `ANTHROPIC_API_KEY`; the emailed ack link uses `NEXT_PUBLIC_APP_URL` (falls back to `https://jambahr.com`) — set it per environment.
- Signed PDF is `upsert:false` (write-once) — the status guard prevents double-acknowledgement; a failure between PDF upload and `signed_records` insert is the only (rare) re-try edge.
- Rejection/decline reasons are audit-only; the candidate/employee email never includes them.

## v1 limits / follow-ups
- Typed-ack only (certified eSign = Phase 2, schema-ready).
- Employees scoped to the active org; only the issuing **entity** varies across a group.
- Not yet exercised end-to-end in a browser (unit + build verified). A `test1`/`TestOrg`-style demo org is the place to walk it.
