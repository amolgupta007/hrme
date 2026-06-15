-- 064_org_whatsapp_credentials.sql — per-org BYO WhatsApp provider (idempotent)
CREATE TABLE IF NOT EXISTS public.org_whatsapp_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('omni','aisensy','wati','meta','centralized')),
  api_key_encrypted text NULL,
  endpoint text NULL,
  extra_encrypted jsonb NULL,
  template_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_whatsapp_credentials_org
  ON public.org_whatsapp_credentials (org_id);

ALTER TABLE public.org_whatsapp_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_org_whatsapp_credentials_org ON public.org_whatsapp_credentials;
CREATE POLICY p_org_whatsapp_credentials_org ON public.org_whatsapp_credentials FOR ALL
  USING (org_id::text = (auth.jwt() ->> 'org_id'))
  WITH CHECK (org_id::text = (auth.jwt() ->> 'org_id'));
