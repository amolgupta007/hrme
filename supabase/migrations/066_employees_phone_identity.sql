-- 066_employees_phone_identity.sql
-- Phone + OTP auth: make email optional, add phone as a parallel per-org identity.
-- Idempotent.

-- 1. Email is no longer mandatory (phone-only employees have no email).
ALTER TABLE employees ALTER COLUMN email DROP NOT NULL;

-- 2. Every employee must still have at least one identity.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_identity_present;
ALTER TABLE employees
  ADD CONSTRAINT employees_identity_present
  CHECK (email IS NOT NULL OR phone IS NOT NULL);

-- 3. Phone is unique within an org when present (the phone-login match key).
DROP INDEX IF EXISTS employees_org_phone_unique;
CREATE UNIQUE INDEX employees_org_phone_unique
  ON employees (org_id, phone)
  WHERE phone IS NOT NULL;
