-- 050_razorpayx_credentials_account_id_unique.sql — Phase 2 post-review fix:
-- enforce UNIQUE on razorpayx_credentials.account_id so the webhook lookup
-- is deterministic. Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'razorpayx_credentials_account_id_key'
  ) THEN
    ALTER TABLE public.razorpayx_credentials
      ADD CONSTRAINT razorpayx_credentials_account_id_key UNIQUE (account_id);
  END IF;
END $$;
