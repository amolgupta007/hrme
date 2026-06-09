-- 058_jambageo_duty_sessions_updated_at.sql
-- Idempotent. Apply via Supabase MCP / SQL Editor.
-- Adds updated_at + trigger to duty_sessions (gap from 054).

ALTER TABLE public.duty_sessions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_duty_sessions_updated_at ON public.duty_sessions;
CREATE TRIGGER trg_duty_sessions_updated_at
  BEFORE UPDATE ON public.duty_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
