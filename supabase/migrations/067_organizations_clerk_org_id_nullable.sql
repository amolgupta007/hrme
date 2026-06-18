-- 067_organizations_clerk_org_id_nullable.sql
-- Clerk Organizations were decoupled (2026-06-18): orgs are now created with
-- NO clerk_org_id (multi-tenancy lives in Supabase organizations + employees).
-- The column was left NOT NULL by 001_initial_schema.sql, so createOrganization()
-- failed with "null value in column \"clerk_org_id\" ... violates not-null constraint".
-- Relax the constraint. The column stays (vestigial, drop later); its UNIQUE index
-- already tolerates multiple NULLs in Postgres.

ALTER TABLE organizations ALTER COLUMN clerk_org_id DROP NOT NULL;
