# Documents Module Redesign — Spec
**Date:** 2026-04-13
**Status:** Approved, ready for implementation

---

## Overview

Redesign the Documents module from a flat list into a role-aware, space-based system with two acknowledgment methods. The goal is to give owners full control over document visibility and to make acknowledgments official enough for internal HR purposes without third-party e-signature costs.

**Scope:** `src/actions/documents.ts`, `src/app/dashboard/documents/page.tsx`, `src/components/documents/documents-client.tsx`, `src/components/documents/upload-dialog.tsx`, one new component `acknowledge-dialog.tsx`, one new component `signed-records-tab.tsx`. No new tables — two `ALTER TABLE` migrations.

---

## Spaces

Documents are organized into three named spaces. Space is set at upload time and cannot be changed after upload.

| Space | Value | Visible to | Purpose |
|-------|-------|-----------|---------|
| Company Wide | `company_wide` | All active employees + admins/owners | HR policies, employee handbook, code of conduct, leave policy |
| Personal Files | `personal` | That specific employee + admin/owner | Offer letters, payslips, ID proof, tax forms |
| Owner Vault | `owner_vault` | Admin / Owner only | Vendor contracts, board docs, financials — private by default |

### Visibility rules enforced server-side in `listDocuments()`

- **Owner / Admin**: receives all documents across all spaces
- **Manager / Employee**: receives only `space = 'company_wide'` docs + `space = 'personal'` docs where `employee_id = their employee ID`
- Owner Vault documents are never returned for manager/employee roles

---

## UI — Tab Structure

The documents page renders tabs based on role:

| Tab | Shown to |
|-----|---------|
| Company Wide | Everyone |
| Personal Files | Everyone (each role sees only their own; admin/owner sees all employees') |
| Owner Vault | Admin / Owner only |
| Signed Records | Admin / Owner only |

Employees and managers land on **Company Wide** by default. Owner Vault and Signed Records tabs are not rendered in their DOM.

---

## Upload Dialog

Space selector is the first field. Downstream fields render conditionally:

```
Space:
  ○ Company Wide
  ○ Personal Files
  ○ Owner Vault

If Company Wide:
  Requires Acknowledgment? [toggle]
  If yes:
    Method:
      ○ Type-your-name  (NDA, Code of Conduct)
      ○ Audit trail     (Leave Policy, general policies)

If Personal Files:
  Employee: [searchable dropdown]

If Owner Vault:
  (no extra fields)

Name, Category, File → Upload
```

- Acknowledgment is only available for Company Wide documents
- Personal Files and Owner Vault never have acknowledgment requirements
- File size limit: 10 MB (unchanged)
- Allowed categories: policy, contract, id_proof, tax, certificate, other (unchanged)

---

## Acknowledgment — Method C: Audit Trail

Used for: Leave Policy, general policy documents.

**Employee UX:** An "Acknowledge" button appears on the document row for any unacknowledged doc that requires acknowledgment. One click. No modal.

**Server records:**
- `employee_id`
- `acknowledged_at` (ISO timestamp)
- `method = 'audit_trail'`
- `ip_address` (from request headers)
- `user_agent` (from request headers)
- `signature_text = null`

---

## Acknowledgment — Method A: Type-your-name

Used for: NDA, Code of Conduct, employment agreements.

**Employee UX:** A "Sign" button appears on the document row. Clicking opens a modal:

```
┌─────────────────────────────────────────┐
│  Sign: [Document Name]                  │
│                                         │
│  By signing, you confirm you have read  │
│  and agree to this document.            │
│                                         │
│  Full name  [ __________________ ]      │
│                                         │
│  [ Cancel ]        [ I Agree & Sign ]   │
└─────────────────────────────────────────┘
```

- "I Agree & Sign" button is disabled until the name field is non-empty
- Submitting calls `acknowledgeDocument()` with the typed name

**Server records:**
- `employee_id`
- `acknowledged_at`
- `method = 'type_name'`
- `signature_text` (the typed full name)
- `ip_address`
- `user_agent`

**Legal basis:** Electronic signatures of this form are valid in India under the Information Technology Act 2000, Section 5. Sufficient for internal HR documents (NDA, Code of Conduct). Not suitable for documents requiring government-recognized DSC (Digital Signature Certificate).

---

## Signed Records Tab

Admin/Owner only. Shows all acknowledgments across the org, grouped by document.

**Layout:** One card per document that has `requires_acknowledgment = true`. Each card shows:
- Document name + method badge (`type-your-name` or `audit trail`)
- Progress: `X / Y acknowledged` (Y = total active employees in org)
- Expandable list of acknowledgments:
  - ✓ Employee name | date + time | typed signature (method A only)
  - ⏳ Pending employee name

Documents with 100% completion are visually distinguished (green progress).

---

## Data Model Changes

Two SQL migrations to run via Supabase SQL Editor:

```sql
-- Migration 1: Add space + ack_method columns to documents
ALTER TABLE documents
  ADD COLUMN space TEXT NOT NULL DEFAULT 'company_wide'
    CHECK (space IN ('owner_vault', 'company_wide', 'personal')),
  ADD COLUMN ack_method TEXT NOT NULL DEFAULT 'none'
    CHECK (ack_method IN ('type_name', 'audit_trail', 'none'));

-- Migrate existing rows to correct space
UPDATE documents SET space = 'company_wide' WHERE is_company_wide = true;
UPDATE documents SET space = 'personal'     WHERE is_company_wide = false AND employee_id IS NOT NULL;
UPDATE documents SET space = 'owner_vault'  WHERE is_company_wide = false AND employee_id IS NULL;

-- Migration 2: Enhance document_acknowledgments with audit fields
ALTER TABLE document_acknowledgments
  ADD COLUMN method TEXT NOT NULL DEFAULT 'audit_trail'
    CHECK (method IN ('type_name', 'audit_trail')),
  ADD COLUMN signature_text TEXT,
  ADD COLUMN ip_address TEXT,
  ADD COLUMN user_agent TEXT;
```

`is_company_wide` and `employee_id` columns are retained — still used in queries and not removed for backwards compatibility.

---

## Files Changed

| File | Change |
|------|--------|
| `src/actions/documents.ts` | Add space-based filtering to `listDocuments()`. Update `uploadDocument()` to accept `space` and `ack_method`. Update `acknowledgeDocument()` to accept `method`, `signature_text`, capture IP + user agent. Add `getSignedRecords()` action for admin ack log. |
| `src/app/dashboard/documents/page.tsx` | Pass `employeeId` to client. Fetch active employee count for Signed Records Y value. |
| `src/components/documents/documents-client.tsx` | Replace category filter tabs with space tabs. Render tabs conditionally by role. |
| `src/components/documents/upload-dialog.tsx` | Add space selector, conditional ack method selector, conditional employee dropdown. |
| `src/components/documents/acknowledge-dialog.tsx` | **New.** Type-your-name modal for method A. |
| `src/components/documents/signed-records-tab.tsx` | **New.** Ack log grouped by document for admin/owner. |

---

## Out of Scope (deferred)

- Downloadable signing certificate PDF
- Email notification when a document is sent for acknowledgment (can be added in a later pass alongside the email system)
- Moving a document between spaces after upload
- Acknowledgment deadline / reminder system
- Department-level or role-level sharing (spaces cover the primary use cases)
