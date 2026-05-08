-- 008_social_agent.sql
-- LinkedIn social-media content agent for /superadmin (single-tenant: JambaHR's own page).
-- Run via Supabase Dashboard SQL Editor. update_updated_at_column() is expected to already exist
-- (created in 001_initial_schema.sql). pgcrypto is enabled by default on Supabase.

-- ---------------------------------------------------------------------------
-- 1. social_themes — content topic rotation seed bank
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  audience TEXT NOT NULL,
  example_hooks JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_themes_active_lastused
  ON social_themes (is_active, last_used_at NULLS FIRST);

-- ---------------------------------------------------------------------------
-- 2. social_posts — drafts and their lifecycle
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','approved','scheduled','publishing','published','failed','rejected')),
  platform TEXT NOT NULL DEFAULT 'linkedin'
    CHECK (platform IN ('linkedin')),
  theme_id UUID REFERENCES social_themes(id) ON DELETE SET NULL,
  caption TEXT NOT NULL,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  image_prompt TEXT,
  image_url TEXT,
  image_alt_text TEXT,
  buffer_post_id TEXT,
  buffer_channel_id TEXT,
  scheduled_for TIMESTAMPTZ,
  error_message TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  published_at TIMESTAMPTZ,
  generated_by_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_status
  ON social_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_buffer
  ON social_posts (buffer_post_id) WHERE buffer_post_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_social_posts_updated ON social_posts;
CREATE TRIGGER trg_social_posts_updated
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. social_agent_runs — one row per cron tick (forensics + theme rotation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('cron','manual')),
  drafts_generated INT NOT NULL DEFAULT 0,
  errors JSONB,
  duration_ms INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- 4. Theme seeds — six initial topics covering compliance, hiring, tooling
-- ---------------------------------------------------------------------------
INSERT INTO social_themes (slug, title, description, audience) VALUES
  ('compliance-india',
   'Indian HR compliance bites',
   'Bite-sized explainers on PF, ESI, gratuity, PT, TDS — what owners get wrong.',
   'small-business owners and HR leads, India'),
  ('hiring-tips',
   'Hiring a small team',
   'Practical hiring playbooks for 10-50 employee orgs.',
   'first-time founders/HR'),
  ('hr-tooling',
   'JambaHR feature spotlights',
   'Show-not-tell of one feature with a real workflow.',
   'HR-curious owners evaluating tools'),
  ('founder-pov',
   'Building JambaHR in public',
   'Founder POV: what we shipped this week, what we learned.',
   'startup-curious LinkedIn audience'),
  ('payroll-explainers',
   'Payroll the right way',
   'Demystify CTC, payslips, statutory deductions.',
   'small-business owners running payroll themselves'),
  ('leave-policy-design',
   'Designing leave policies',
   'How to set sick/casual/earned leave for an Indian SMB.',
   'HR-leads and founders')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Storage bucket for generated images (public-read for Buffer/LinkedIn fetch)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-media-images', 'social-media-images', true)
ON CONFLICT (id) DO NOTHING;
