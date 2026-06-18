-- 068: Indeed job-sync state (Approach A). Additive, idempotent.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS indeed_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS indeed_job_id text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS indeed_status text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS indeed_synced_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS indeed_sync_error text;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_indeed_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_indeed_status_check
  CHECK (indeed_status IS NULL OR indeed_status IN ('pending','posted','expired','error'));

CREATE INDEX IF NOT EXISTS idx_jobs_indeed_job_id ON jobs (indeed_job_id) WHERE indeed_job_id IS NOT NULL;
