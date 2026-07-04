# Plan: Offer Letter & Document Templating System (Phase 1)

> Response to `docs/prds/documents-feature.md` — Phase 0 investigation findings + Phase 1 build plan.
> **Status: awaiting approval. No code written yet.**

---

## 0. TL;DR — what changed vs the PRD's assumptions

The PRD was written against an assumed architecture that this repo has since moved past. Three reconciliations are load-bearing — please read these before the rest:

| PRD assumed | Reality in this codebase | Impact on plan |
|---|---|---|
| A `group_id` column exists on data tables; reads scoped "to all entities in my group" via Clerk JWT. | **No `group_id` on any data table.** A group is a superadmin-only overlay: `company_groups` + `org_group_memberships` (migration `091`), with `UNIQUE(org_id)` → an org is in **≤1 group**. Resolved in code via `src/lib/attendance/company-group.ts` (`getOrgGroupId`, `getGroupOrgIds`, `getSiblingOrgIds`). Most orgs are **ungrouped**. | Templates carry `org_id` (owner entity) **+ nullable `group_id`**. Read scope resolves the caller's group at query time and spans it when grouped, else single-org. Reuse the existing group helpers — do **not** invent a parallel group model. |
| Clerk `org_id` → JWT → RLS enforces tenant isolation. | **Clerk Organizations decoupled** (2026-06-18). `getCurrentUser()` uses only Clerk `userId`; active org comes from the `employees` table + `jambahr_active_org` cookie. **RLS is advisory** — every server action uses the **service-role** client and enforces isolation with explicit `.eq("org_id", …)` filters (gotcha #5). | RLS policies are written as defense-in-depth (matching migration `009`/`018` style), but the **real** gate is app-layer: service-role client + explicit scope filter + `isAdmin(role)` for Signed Records. |
| Existing PDF generation can be reused. | **There is zero PDF infrastructure.** No puppeteer / react-pdf / pdfkit / pdf-lib in `package.json`. Payslips & insights use `window.print()` only. | P1 must **introduce** a server-side PDF renderer. Recommendation below: `@react-pdf/renderer` (pure-Node, serverless- and Windows-dev-safe). This is the single biggest new dependency. |

Everything else in the PRD (clause-based builder, AI first draft, bulk issuance, typed-ack e-signature, immutable Signed Records, pluggable SignatureProvider) maps cleanly onto existing patterns.

---

## 1. Phase 0 findings (evidence-backed)

### 1.1 Group / entity modeling
- **Canonical link:** `org_group_memberships(group_id → company_groups.id, org_id → organizations.id)`, `UNIQUE(org_id)` (migration `091_company_groups.sql`). No column on `organizations`, no `parent_org_id`, no settings-JSONB grouping.
- **Resolution helpers** (`src/lib/attendance/company-group.ts`, plain module, takes a service-role client): `getOrgGroupId(sb, orgId)`, `getGroupOrgIds(sb, groupId)`, `getSiblingOrgIds(sb, orgId)`, `assertSameGroup(sb, a, b)`, `getGroupLocationIds(sb, orgId)`.
- **Management is superadmin-only** (`src/actions/company-groups.ts`, gated by `isSuperadminAuthenticated()`). A normal org admin cannot create/join a group today. Origin design: `docs/planning/cross-org-attendance-company-groups-plan.md`.
- **Precedent for cross-org scoping**: attendance ingest already unions sibling orgs (`adms-ingest.ts`, `resolve-zone.ts`). We follow the same idiom.

### 1.2 Active-org / tenancy
- `getCurrentUser()` (`src/lib/current-user.ts`) → single-entity `UserContext`: `{ orgId, orgName, clerkUserId, role, employeeId, firstName, employmentType, plan, customFeatures, jambaHireEnabled, attendanceEnabled, … }`. **No group field.** To span a group you call `getSiblingOrgIds` manually and `.in("org_id", [...])`.
- `resolveActiveOrg` honors the cookie only if the caller is a member; tampering can't widen scope.

### 1.3 Roles
- `UserRole = "owner" | "admin" | "manager" | "employee"` (`src/types/index.ts`), hierarchy 4/3/2/1.
- Gates: `isAdmin(role)` = owner|admin; `isOwner(role)` = owner; `isManagerOrAbove` = owner|admin|manager (`src/lib/current-user.ts`).
- Advisory RLS uses JWT-claim strings `'org:owner'` / `'org:admin'` — inactive today.

### 1.4 Employee shape (offer-letter variables)
- `employees`: `first_name`, `last_name`, `email`, **`designation`** (single nullable free-text; no `title`/`position`), `department_id` (FK, not a name), `employment_type` (full_time|part_time|contract|intern), **`date_of_joining`** (DATE), `status`, `org_id`, `reporting_manager_id`.
- **CTC is not on `employees`.** It lives on `salary_structures.ctc` (annual, numeric), `UNIQUE(org_id, employee_id)` (migration `018`). For a new hire from the ATS, CTC is on the `offers` object instead.

### 1.5 AI infra (reusable)
- Direct `@anthropic-ai/sdk`, key = `ANTHROPIC_API_KEY`. JD generation (`generateJobDescription`, `hire.ts`) uses `claude-haiku-4-5-20251001` but returns **free text**.
- **Best structured-output template to copy:** `src/lib/screening/score.ts` — prompt-for-JSON → `extractJson()` (first `{` … last `}`) → Zod `.parse()` → **retry once**, with token-usage tracking. `src/lib/screening/criteria.ts` and `parse.ts` follow the same idiom. No native tool-use/`generateObject` anywhere.
- pgvector (Voyage `voyage-3-large`, `doc_chunks`) exists but is **retrieval, not generation** — orthogonal to clause generation unless we later want RAG grounding on the org's own policy docs. Not needed for P1.

### 1.6 Storage / PDF / email / tokens
- **Storage:** `documents` bucket is **private**; `uploadDocument` (`src/actions/documents.ts`) uploads via service-role to `${orgId}/${uuid}.${ext}`, stores the **path** in `documents.file_url`, and reads back via `createSignedUrl(path, 3600)`. **No shared signed-URL helper** — it's inline in one place. We'll add one.
- **PDF:** none (see §0).
- **Email:** `src/lib/resend.ts` → `FROM_EMAIL` (support@), `NOREPLY_EMAIL`(+`_FROM`) (noreply@), `FOUNDER_EMAIL_FROM` (amol@). Pattern: dynamic-import `render(ReactEmail(...))` → `resend.emails.send`. ~40 templates in `src/components/emails/`.
- **Token flows:** LOI, contractor-agreement, referral, ownership all use `randomBytes(32).toString("base64url")` (256-bit). The **offer** flow uses a weaker `crypto.randomUUID()` — do **not** copy that one.
- **IP/UA audit capture** exists in exactly two places — `acknowledgeDocument` (`documents.ts`) and **`signAgreement` (`contractor-agreements.ts`)** — both read `next/headers` (`x-forwarded-for` → `x-real-ip` → `"unknown"`) and store `ip_address` + `user_agent`. **`signAgreement` is the closest existing precedent for our typed-ack flow** — copy it.

---

## 2. Data model — DDL sketch (reconciled)

New migrations start at **`093`** (latest applied is `092`). All tables get `org_id` (owning entity) and — where the PRD wanted group scope — a **nullable `group_id`** stamped at create time from `getOrgGroupId(orgId)`.

### 093_document_templates_core.sql
```sql
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade, -- creating entity
  group_id uuid references company_groups(id) on delete set null,      -- nullable; null = single-org scope
  name text not null,
  type text not null check (type in ('offer_letter','nda','policy')),
  body_structure jsonb not null default '{}'::jsonb, -- ordering/layout metadata; clauses are rows below
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_document_templates_org on document_templates(org_id);
create index idx_document_templates_group on document_templates(group_id) where group_id is not null;

create table public.document_clauses (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references document_templates(id) on delete cascade,
  order_index int not null,
  title text not null,
  body_markdown text not null,
  is_mandatory boolean not null default false,
  category text not null check (category in ('behavior','compliance','confidentiality','comp','custom')),
  created_at timestamptz not null default now()
);
create index idx_document_clauses_template on document_clauses(template_id, order_index);

create table public.clause_library (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,   -- null for system defaults
  group_id uuid references company_groups(id) on delete set null,
  title text not null,
  body_markdown text not null,
  category text not null check (category in ('behavior','compliance','confidentiality','comp','custom')),
  is_system_default boolean not null default false,
  created_at timestamptz not null default now()
);
-- read scope: system defaults (org_id is null) UNION caller's group/org scope

create table public.document_variables (
  key text primary key,          -- 'employee_name','designation','ctc','joining_date',
  label text not null,           --  'issuing_entity_name','issuing_entity_address','group_name', …
  source text not null           -- 'employee' | 'salary_structure' | 'issuing_entity' | 'group' | 'manual'
);
-- seeded system rows; small enough it could be static config, but a table keeps it inspectable
```

### 094_issued_documents.sql
```sql
create table public.issued_documents (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references document_templates(id),
  employee_id uuid not null references employees(id),
  issuing_entity_id uuid not null references organizations(id),  -- chosen at issuance (a group member org)
  org_id uuid not null references organizations(id) on delete cascade, -- creating entity (for scope filters)
  group_id uuid references company_groups(id) on delete set null,
  resolved_values jsonb not null,        -- snapshot of every {{variable}} at send time
  rendered_body jsonb not null,          -- frozen clause list actually issued (template can change later)
  draft_pdf_url text,                    -- storage path; regeneratable, MUTABLE
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','acknowledged','declined')),
  ack_token text unique,                 -- randomBytes(32) base64url; set at send
  ack_token_expires_at timestamptz,      -- lazy-expire like LOI
  sent_at timestamptz,
  viewed_at timestamptz,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_issued_documents_org on issued_documents(org_id);
create index idx_issued_documents_employee on issued_documents(employee_id);
create unique index uq_issued_ack_token on issued_documents(ack_token) where ack_token is not null;
```
Note additions vs PRD: `org_id` (needed for the real `.eq("org_id")` scope filter), `rendered_body` (freeze the issued clauses so later template edits don't mutate an already-sent document), and `ack_token*` on this table (the acknowledgement link points at the issued document).

### 095_signed_records.sql (append-only audit)
```sql
create table public.signed_records (
  id uuid primary key default gen_random_uuid(),
  issued_document_id uuid not null references issued_documents(id),
  employee_id uuid not null references employees(id),
  issuing_entity_id uuid not null references organizations(id),
  org_id uuid not null references organizations(id) on delete cascade,
  group_id uuid references company_groups(id) on delete set null,
  signed_pdf_url text not null,          -- storage path; written ONCE, never overwritten (immutable)
  signer_name text not null,             -- typed confirmation
  signer_ip text,
  user_agent text,
  acknowledgement_text text not null,    -- fixed statement shown at accept time (frozen copy)
  acknowledged_at timestamptz not null default now(),
  -- eSign extensibility (P1 always 'typed_ack'):
  signature_method text not null default 'typed_ack'
    check (signature_method in ('typed_ack','aadhaar_esign','dsc')),
  esign_provider text,
  esign_transaction_id text,
  esign_certificate_url text,
  created_at timestamptz not null default now()
);
create index idx_signed_records_org on signed_records(org_id);
create index idx_signed_records_issued on signed_records(issued_document_id);
```

---

## 3. RLS approach (advisory) + real enforcement

Follow the established two-layer model exactly:

**Layer 1 — advisory RLS (defense-in-depth, matches migration `009`/`018`/`092`):**
- `document_templates`, `clause_library`, `document_clauses`, `issued_documents`: `ENABLE RLS`; SELECT policy `auth.jwt() ->> 'org_id' = org_id::text` (activates only if Clerk-JWT wiring ever lands). `clause_library` SELECT also allows `is_system_default`.
- `signed_records`: `ENABLE RLS`; **SELECT** policy restricted to `org_role IN ('org:owner','org:admin')` **and** org match; **no INSERT/UPDATE/DELETE policy at all** → append-only, no mutation even under future JWT enforcement.

**Layer 2 — real enforcement (the one that actually runs today):**
- All server actions use `createAdminSupabase()` (service role).
- **Read scope** via a new helper `resolveDocScope(sb, orgId)`:
  - `gid = getOrgGroupId(sb, orgId)`;
  - if `gid` → filter `.eq("group_id", gid)` (spans the group), issuing-entity choices = `getGroupOrgIds(sb, gid)`;
  - else → filter `.eq("org_id", orgId).is("group_id", null)`, issuing-entity choices = `[orgId]`.
- **Signed Records reads** additionally gated by `isAdmin(user.role)` in the action (mirrors how payroll & other owner/admin surfaces are gated today). Non-admins → `Unauthorized`.
- **Employee acknowledgement never writes the table directly** — it goes through the public server action `acknowledgeIssuedDocument(token, …)` which validates the token and inserts via service role. No employee-facing table write path exists.

---

## 4. AI clause JSON contract

Reuse the `src/lib/screening/score.ts` idiom verbatim (direct SDK → prompt-for-JSON → `extractJson` → Zod `.parse` → 1 retry → usage tracking). New module `src/lib/documents/generate-clauses.ts`.

**Model:** `claude-sonnet-4-6` (clause quality/compliance nuance matters more than the JD blurb; ~a few thousand output tokens, cost negligible per generation). Fallback to haiku is trivial if cost becomes a concern.

**Input (server-resolved, never trust client for entity data):**
```ts
type ClauseGenInput = {
  groupName: string;            // organizations.name of the group/entity context
  issuingEntityName?: string;
  roleTitle: string;            // designation being hired for
  industry?: string;
  employmentType: 'full_time' | 'part_time' | 'contract' | 'intern';
  state?: string;               // for PF/ESI/PT relevance (India)
  pastedClauses?: string[];     // optional raw text to fold in
  documentType: 'offer_letter' | 'nda' | 'policy';
};
```

**Output (Zod-validated):**
```ts
const ClauseSchema = z.object({
  title: z.string(),
  category: z.enum(['behavior','compliance','confidentiality','comp','custom']),
  body_markdown: z.string(),          // may contain {{variable}} placeholders
  is_mandatory: z.boolean(),
});
const ClauseGenResultSchema = z.object({
  clauses: z.array(ClauseSchema).min(1),
  detected_variables: z.array(z.string()), // e.g. ['employee_name','designation','ctc',…]
});
```

**Prompt rules:** Indian-context defaults (probation, notice period, confidentiality, code of conduct, PF/ESI/PT where the state/employment-type warrants), every clause independently editable/removable, use `{{variable}}` placeholders for per-employee data, output **exactly one JSON object, no markdown fences**. Result lands in the builder as an **editable DRAFT template (`status='draft'`)** — never auto-`active`. Human-in-the-loop enforced by the status field.

**Placeholder validation:** builder validates every `{{token}}` in clause bodies against `document_variables.key`; unknown tokens flagged before a template can go `active` or be issued.

---

## 5. Secure acknowledgement-link token design

Copy the LOI / `signAgreement` idiom (the strong one, **not** the offer UUID):

- **Generate:** `randomBytes(32).toString("base64url")` (256-bit), set on `issued_documents.ack_token` at send, with `ack_token_expires_at = now + N days` (default **30**, configurable).
- **Public route:** `src/app/documents/ack/[token]/page.tsx`, added to the `middleware.ts` public matcher (`"/documents/ack(.*)"`). Unauthenticated. On load, records `viewed_at` / `status='viewed'` (first view) — same as the offer page auto-processing pattern.
- **Public action** `acknowledgeIssuedDocument(token, { signerName, response, declineReason? })`:
  - service-role lookup by `ack_token`; guard `status IN ('sent','viewed')`; **lazy-expire** if past `ack_token_expires_at` (flip to a terminal state and refuse, exactly like `respondToLOI`).
  - capture `ip` + `user_agent` from `next/headers` (`x-forwarded-for` → `x-real-ip` → `"unknown"`) — copied from `signAgreement`.
  - **Accept:** invoke `SignatureProvider.finalize(...)` (§6) → renders final PDF, inserts immutable `signed_records` row (`signature_method='typed_ack'`), sets `issued_documents.status='acknowledged'`. Email admins (owner/admin of the issuing entity) via `FROM_EMAIL`.
  - **Decline:** `status='declined'`, optional reason stored on `issued_documents` (not on the immutable record); no signed_records row.
- **Acknowledgement statement (frozen copy, stored on the record):** wording must state this is **acknowledgement of receipt/agreement, NOT a digitally certified signature** (satisfies PRD §4). Exact copy to be finalized with you; draft: *"By typing my name below I acknowledge that I have read, received, and agree to the terms of this document. I understand this is an electronic acknowledgement of receipt and agreement, not a digitally certified or Aadhaar-based signature."*

---

## 6. SignatureProvider interface (pluggable — build TypedAck now)

`src/lib/documents/signature/` — provider abstraction so Phase 2 (Digio/Leegality Aadhaar eSign) drops in with **no schema change**:

```ts
export type SignatureContext = {
  signerName: string;
  ip?: string;
  userAgent?: string;
  acknowledgementText: string;
};

export type SignedResult = {
  signatureMethod: 'typed_ack' | 'aadhaar_esign' | 'dsc';
  signerName: string;
  signedPdfPath: string;          // immutable storage path
  acknowledgedAt: string;         // ISO
  signerIp?: string;
  userAgent?: string;
  esignProvider?: string;         // 'digio' | 'leegality' | null
  esignTransactionId?: string;
  esignCertificateUrl?: string;
};

export interface SignatureProvider {
  readonly method: SignedResult['signatureMethod'];
  finalize(issuedDocumentId: string, ctx: SignatureContext): Promise<SignedResult>;
}
```

- **P1 impl:** `TypedAckProvider` — renders the final signed PDF (embeds name/timestamp/IP acknowledgement block), uploads once to the immutable path, returns `signatureMethod: 'typed_ack'`.
- **Phase 2:** `DigioProvider` / `LeegalityProvider` populate the `esign_*` fields and set `signature_method='aadhaar_esign'`. DSC stays a valid enum value but is **not** planned (ill-suited to bulk remote issuance), per PRD.
- A tiny factory `getSignatureProvider(method)` returns the impl; `acknowledgeIssuedDocument` calls it — the action never hard-codes typed-ack logic.

---

## 7. PDF rendering recommendation

**Recommendation: `@react-pdf/renderer` (pure-Node, no headless browser).**

Rationale against the constraints:
- **Vercel serverless:** pure JS, small bundle, no chromium binary, no cold-start penalty, no function-size blowout. Renders inside a normal Node server action / route.
- **WSL/Windows dev:** identical behavior on Windows — no puppeteer chromium download or sandbox flags (a genuine pain on this dev machine).
- **Deterministic & immutable:** same component renders both artifacts; the signed variant just adds the acknowledgement block. Byte-stable output suits an audit record.

**Rejected alternative — puppeteer + `@sparticuz/chromium`:** better raw HTML/CSS fidelity, but 50 MB+ bundle, slow cold starts, brittle on Windows dev, and overkill for structured clause documents. Revisit only if pixel-perfect HTML fidelity becomes a hard P2 requirement (then isolate it in a dedicated function).

**Tradeoff to accept:** react-pdf has no HTML/markdown engine. Clause bodies are markdown, so we add a small **markdown-subset → react-pdf primitives** mapper (headings, bold/italic, paragraphs, unordered/ordered lists — the subset the AI is prompted to produce). `{{variable}}` tokens are resolved to `resolved_values` **before** rendering.

**Two distinct artifacts (per PRD):**
| Artifact | Path | Mutability | Bucket |
|---|---|---|---|
| Draft PDF | `${orgId}/doc-drafts/${issuedDocId}.pdf` | Regeneratable / overwritable | `documents` (private) |
| Signed PDF | `${orgId}/doc-signed/${signedRecordId}.pdf` | **Written once, never overwritten** | `documents` (private) |

Both private; served through a **new shared signed-URL helper** `getSignedDocUrl(path, ttl)` (none exists today — `createSignedUrl` is inline in one place). Signed Records downloads go through it, gated by `isAdmin`.

---

## 8. Build order (Phase 1, once approved)

1. Migrations `093`–`095` (via Supabase MCP / SQL Editor per gotcha #4) + seed `document_variables` and a starter `clause_library` of Indian-context system defaults.
2. `src/lib/documents/` core: `resolveDocScope`, markdown→react-pdf renderer, `generate-clauses.ts`, `signature/` provider + `TypedAckProvider`, signed-URL helper.
3. Server actions `src/actions/documents-templating.ts`: template CRUD, clause CRUD, AI generate, issuance (bulk resolve + render + send), public `acknowledgeIssuedDocument`.
4. UI: template builder (drag/reorder clause editor + category-grouped library picker + live preview with sample data), AI "Generate offer letter" dialog, issuance wizard (multi-select employees + issuing-entity dropdown + inline variable overrides + per-employee preview + bulk send), public `/documents/ack/[token]` page, **Signed Records** section (owner/admin only, filters by entity/template/date).
5. Emails: `document-issued.tsx` (token link), `document-acknowledged.tsx` (admin notice). Register any new `/dashboard/*` route in the AI-assistant route registry + a help article (gotcha #61).
6. Plan gating: decide tier (recommend **Growth+**, matching Documents/Reviews) and wire `hasFeature`.

---

## 9. Decisions I need from you before building

1. **Group scoping (most important).** Confirm the reconciled model: templates are `org_id`-scoped with a nullable `group_id`; multi-entity issuance lights up **only for orgs a superadmin has placed in a `company_group`** (exactly like the attendance model); ungrouped orgs issue from themselves. Alternative would be forcing every org into a singleton group — I recommend **against** it.
2. **PDF engine.** Approve `@react-pdf/renderer` (+ markdown-subset mapper), or do you want full HTML fidelity via chromium despite the serverless/dev cost?
3. **Plan tier.** Which tier gates this — Growth+ (like Documents/Reviews) or Business-only?
4. **AI model.** `claude-sonnet-4-6` for clause quality (my rec) vs `claude-haiku-4-5` for cost.
5. **Ack link expiry & acknowledgement statement copy.** OK with 30-day lazy-expire and the draft statement wording in §5?
6. **System clause library seed.** Want me to seed a starter set of Indian-context clauses (probation, notice, confidentiality, code of conduct, PF/ESI) as `is_system_default`, or ship the library empty and let AI/manual fill it?

**Stopping here for your approval, per the PRD.**
