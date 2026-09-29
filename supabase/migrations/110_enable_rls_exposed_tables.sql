-- 110_enable_rls_exposed_tables.sql
-- Six tables in the PostgREST-exposed `public` schema had RLS DISABLED while
-- the `anon` and `authenticated` roles held full SELECT/INSERT/UPDATE/DELETE
-- grants (Supabase advisor lint 0013, found 2026-09-30). With the publishable
-- key — which is public by design — anyone could read or rewrite every org's
-- attendance, document acknowledgements, employee invites and social posts.
--
-- All app access goes through the service-role client, which bypasses RLS
-- (gotcha #5), and no code uses the anon-key clients. Enabling RLS with no
-- policies therefore denies anon/authenticated completely and changes nothing
-- for the app. Idempotent.

alter table public.attendance_records       enable row level security;
alter table public.document_acknowledgments enable row level security;
alter table public.employee_invites         enable row level security;
alter table public.social_posts             enable row level security;
alter table public.social_themes            enable row level security;
alter table public.social_agent_runs        enable row level security;
