-- 093_employees_phone_unique_exclude_terminated.sql
-- Root-cause fix: the per-org phone-uniqueness index (066) had no status predicate,
-- so a TERMINATED employee's phone permanently occupied the uniqueness slot. Because
-- terminated rows are hidden from the directory, admins couldn't see what was blocking
-- them, and re-adding an employee with that phone failed with "phone already exists".
-- Narrow the index to non-terminated rows so a terminated row no longer blocks a re-add.
-- (Safe: pre-verified no org has >1 non-terminated row sharing a phone.)

DROP INDEX IF EXISTS employees_org_phone_unique;
CREATE UNIQUE INDEX employees_org_phone_unique
  ON employees (org_id, phone)
  WHERE phone IS NOT NULL AND status <> 'terminated';
