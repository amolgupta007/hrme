-- seed-tmp-group.sql — link TMP Wagholi + TMP Boat Club into the "TMP" company group.
-- Idempotent. Resolves orgs by name so it survives env differences.
-- Run the collision check FIRST (see bottom) — PINs must be unique across the group.
--
-- Live ids (HRme, 2026-07-03): TMP Boat Club 6e628fb9-225d-42a8-a23b-9ff1ae0117f9,
--                              TMP Wagholi   804544d4-b965-4e35-bd23-d8e247513d03.

-- 1) Create the group (idempotent by name).
INSERT INTO public.company_groups (name, created_by)
SELECT 'TMP', 'seed-script'
WHERE NOT EXISTS (SELECT 1 FROM public.company_groups WHERE name = 'TMP');

-- 2) Add both orgs to the TMP group (UNIQUE(org_id) makes this safe to re-run).
INSERT INTO public.org_group_memberships (group_id, org_id)
SELECT g.id, o.id
FROM public.company_groups g
CROSS JOIN public.organizations o
WHERE g.name = 'TMP'
  AND o.name IN ('TMP Wagholi', 'TMP Boat Club')
ON CONFLICT (org_id) DO NOTHING;

-- 3) Verify membership.
SELECT g.name AS group_name, o.name AS org_name
FROM public.org_group_memberships m
JOIN public.company_groups g ON g.id = m.group_id
JOIN public.organizations o ON o.id = m.org_id
WHERE g.name = 'TMP'
ORDER BY o.name;

-- ---------------------------------------------------------------------------
-- PIN COLLISION CHECK — run this and confirm ZERO rows before relying on
-- cross-org attribution. Any device_code assigned in BOTH orgs is ambiguous
-- and would be routed to unresolved_punches instead of attributed.
-- (Expected clean: Boat Club PINs 10-32, Wagholi 33-56.)
-- ---------------------------------------------------------------------------
-- SELECT e.device_code AS pin, array_agg(DISTINCT o.name) AS orgs
-- FROM public.employees e
-- JOIN public.organizations o ON o.id = e.org_id
-- WHERE o.name IN ('TMP Wagholi', 'TMP Boat Club')
--   AND e.device_code IS NOT NULL
--   AND e.status <> 'terminated'
-- GROUP BY e.device_code
-- HAVING COUNT(DISTINCT e.org_id) > 1;
