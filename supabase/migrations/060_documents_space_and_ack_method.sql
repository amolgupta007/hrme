-- 060_documents_space_and_ack_method
--
-- Documents redesign (docs/superpowers/plans/2026-04-13-documents-redesign.md).
-- The redesign's application code shipped in April 2026, but this migration
-- (its "Task 1") was never applied to prod. The missing columns broke document
-- uploads ("ack_method column does not exist"), non-admin listing (filters on
-- `space`), and the acknowledge / signed-records flows. Applied to the HRme
-- project on 2026-06-15. Idempotent so it is safe to re-run.

-- Space-based filtering + per-document acknowledgment method.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS space TEXT NOT NULL DEFAULT 'company_wide'
    CHECK (space IN ('owner_vault', 'company_wide', 'personal')),
  ADD COLUMN IF NOT EXISTS ack_method TEXT NOT NULL DEFAULT 'none'
    CHECK (ack_method IN ('type_name', 'audit_trail', 'none'));

-- Backfill legacy rows from the pre-redesign shape.
UPDATE documents SET space = 'company_wide' WHERE is_company_wide = true;
UPDATE documents SET space = 'personal'     WHERE is_company_wide = false AND employee_id IS NOT NULL;
UPDATE documents SET space = 'owner_vault'  WHERE is_company_wide = false AND employee_id IS NULL;
UPDATE documents SET ack_method = 'audit_trail' WHERE requires_acknowledgment = true AND ack_method = 'none';

-- Rich acknowledgment capture (type-your-name signing + audit metadata).
ALTER TABLE document_acknowledgments
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'audit_trail'
    CHECK (method IN ('type_name', 'audit_trail')),
  ADD COLUMN IF NOT EXISTS signature_text TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Speeds up the non-admin space filter in listDocuments().
CREATE INDEX IF NOT EXISTS idx_documents_org_space ON documents (org_id, space);
