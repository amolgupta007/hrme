-- 094_employees_email_unique_exclude_terminated.sql
-- Same root-cause fix as 093, for email: the original UNIQUE(org_id, email)
-- constraint (001) counted TERMINATED rows, so a departed employee's email
-- permanently occupied the uniqueness slot and blocked re-adding with
-- "email already exists". Replace the constraint with a partial unique index
-- that excludes terminated rows (and, like the old constraint, ignores NULL
-- emails so many employees without an email still coexist).
-- (Safe: pre-verified no org has >1 non-terminated row sharing an email.)

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_org_id_email_key;
DROP INDEX IF EXISTS employees_org_email_unique;
CREATE UNIQUE INDEX employees_org_email_unique
  ON employees (org_id, email)
  WHERE email IS NOT NULL AND status <> 'terminated';
