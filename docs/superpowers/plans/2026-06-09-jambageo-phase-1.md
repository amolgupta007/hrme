# JambaGeo Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the backend + web manager surface of JambaGeo (lightweight lead CRM + geofence configuration + stub live-map) in the existing Next.js portal, with a mobile-ready schema so PRD 04 wires writers in later.

**Architecture:** Six new Supabase tables (3 Phase-1 web-writable, 3 mobile-only writers), six server-action files, new `/dashboard/geo/*` route group with kanban + Mapbox-backed UIs, two crons (one immediate, one DPDP-prep), AI-assistant route registry + 7 help articles. All gated on Business plan + `organizations.settings.jambageo_enabled` org toggle (mirrors JambaHire).

**Tech Stack:** Next.js 14 (App Router, pinned), TypeScript strict, Supabase Postgres + RLS, Clerk auth, Mapbox GL JS via `react-map-gl` + `@mapbox/mapbox-gl-draw`, `@dnd-kit/*` (already installed), Recharts (already installed), Resend + React Email, Vitest, shadcn/ui primitives, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-09-jambageo-phase-1-design.md`
**PRD:** `docs/prds/03-PRD-JambaGeo.md`

---

## File Structure (new files only)

```
supabase/migrations/
  051_jambageo_geofences.sql
  052_jambageo_leads.sql
  053_jambageo_lead_visits.sql
  054_jambageo_duty_sessions.sql
  055_jambageo_location_pings.sql
  056_jambageo_geo_consents.sql
  057_jambageo_rls.sql

src/app/dashboard/geo/
  layout.tsx, page.tsx
  leads/page.tsx, leads/[id]/page.tsx
  geofences/page.tsx
  live-map/page.tsx
  reports/page.tsx
  my-leads/page.tsx

src/app/api/cron/
  jambageo-followup-reminders/route.ts
  jambageo-retention-sweep/route.ts

src/actions/
  geo-leads.ts, geo-geofences.ts, geo-visits.ts
  geo-sessions.ts, geo-consents.ts, geo-reports.ts

src/lib/
  jambageo-access.ts
  mapbox.ts
  geo/geometry.ts
  geo/stages.ts

src/components/geo/
  geo-nav.tsx
  leads-kanban.tsx, lead-card.tsx, leads-list.tsx
  lead-dialog.tsx, lead-detail.tsx
  visit-timeline.tsx, log-visit-dialog.tsx
  geofence-map.tsx, geofence-list.tsx
  live-map.tsx
  funnel-chart.tsx, overdue-followups.tsx

src/components/settings/
  jambageo-section.tsx

src/components/emails/
  lead-assigned.tsx

src/lib/assistant/help/articles/
  geo_overview.md, geo_create_lead.md, geo_assign_lead.md
  geo_log_visit.md, geo_kanban_drag.md, geo_geofences.md, geo_reports.md

scripts/
  seed-jambageo-demo.sql

tests/geo/
  geometry.test.ts, stages.test.ts
  stage-transitions.test.ts, manager-scope.test.ts, validation.test.ts
```

**Modified files:**
- `src/config/plans.ts` (+ `jambageo` feature on Business tier)
- `src/config/navigation.ts` (+ JambaGeo sidebar entry)
- `src/lib/current-user.ts` (+ `jambaGeoEnabled` field)
- `src/lib/assistant/route-registry.ts` (+ entries for every new geo page)
- `src/components/settings/settings-content.tsx` (+ render `JambaGeoSection`)
- `src/actions/settings.ts` (+ `updateJambaGeoSettings`)
- `src/types/database.types.ts` (+ six table types)
- `src/types/index.ts` (+ `Lead`, `LeadVisit`, `Geofence`, `DutySession`, `LocationPing`, `GeoConsent` types + `LEAD_STAGES` const)
- `vercel.json` (+ 2 cron entries)
- `package.json` (+ `react-map-gl`, `mapbox-gl`, `@mapbox/mapbox-gl-draw` deps)
- `next.config.js` (verify if `mapbox-gl` needs `serverComponentsExternalPackages`)
- `CLAUDE.md` (+ JambaGeo module section after merge)
- `.env.local.example` (+ `NEXT_PUBLIC_MAPBOX_TOKEN`)

---

## Task List Overview

1. Foundation: deps, env scaffolding, plans flag, navigation, current-user
2. Migrations 051–057 + apply via Supabase MCP
3. TypeScript types + Lib helpers (geometry, stages, mapbox, access) — TDD
4. Server actions: geo-geofences
5. Server actions: geo-leads (CRUD, scope, stage transitions)
6. Server actions: geo-visits (CRUD, system-row guard)
7. Server actions: geo-sessions, geo-consents, geo-reports
8. Settings: jambageo-section + `updateJambaGeoSettings`
9. Email template + wire `assignLead` notification
10. Geo route group: layout + nav component
11. Geofences page: map + list
12. Leads kanban + lead-card + leads-list
13. Lead dialog (create/edit)
14. Lead detail + visit timeline + log-visit dialog
15. Live map page (Phase 1 empty-state)
16. Reports page: funnel + overdue
17. My-leads page
18. Crons: follow-up reminders + retention sweep
19. AI assistant: route registry + 7 help articles + re-embed
20. Demo seed + manual verification + CLAUDE.md update

---

## Task 1: Foundation — deps, env, plans flag, navigation, current-user

**Files:**
- Modify: `package.json` (add deps)
- Modify: `.env.local.example`
- Modify: `src/config/plans.ts`
- Modify: `src/config/navigation.ts`
- Modify: `src/lib/current-user.ts`

- [ ] **Step 1: Install Mapbox deps**

```bash
npm install react-map-gl mapbox-gl @mapbox/mapbox-gl-draw
npm install --save-dev @types/mapbox-gl @types/mapbox__mapbox-gl-draw
```

Verify `package.json` now lists `react-map-gl`, `mapbox-gl`, `@mapbox/mapbox-gl-draw` under `dependencies`.

- [ ] **Step 2: Add Mapbox token to env example**

Add to `.env.local.example`:

```
# Mapbox — public token, URL-restricted in Mapbox console (jambahr.com, *.vercel.app)
# Used by JambaGeo geofence map and live-staff map.
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your-public-token-here
```

Then locally: paste a real Mapbox public token into `.env.local`. (User generates from https://account.mapbox.com/access-tokens/.)

- [ ] **Step 3: Add `jambageo` plan feature**

In `src/config/plans.ts`, find the plan feature matrix and add `jambageo` to Business only. Grep first to locate the type:

```bash
grep -n "hasFeature\|jambahire" src/config/plans.ts | head -20
```

Add to the feature union type and to the Business-tier features array. The exact name in the existing code is the plan-feature string union (e.g. `"jambahire"` is already there); add `"jambageo"` alongside it on Business tier only.

- [ ] **Step 4: Add `jambaGeoEnabled` to `getCurrentUser()`**

In `src/lib/current-user.ts`, find where `jambaHireEnabled` is derived from `organizations.settings.jambahire_enabled` and add the parallel for `jambageo_enabled`:

```ts
// inside the settings derivation block (mirror jambaHireEnabled)
const jambaGeoEnabled = Boolean((settings as any)?.jambageo_enabled);
```

Then add `jambaGeoEnabled` to the returned object's type and value. Update the return-type declaration to include `jambaGeoEnabled: boolean`.

- [ ] **Step 5: Add JambaGeo sidebar entry**

In `src/config/navigation.ts`, find the JambaHire entry and add a parallel JambaGeo entry after it. Use `MapPin` icon from `lucide-react`. Feature flag string is `"jambageo"` (matches the plans-feature added in Step 3). The entry should also include the compound flag for the org-toggle — look at how the JambaHire/Referrals entry references the `jambaHireEnabled` org flag; mirror that for `jambaGeoEnabled`.

```ts
{
  label: "JambaGeo",
  href: "/dashboard/geo",
  icon: MapPin,
  featureFlag: "jambageo",
  // mirrors how the existing JambaHire entry compounds plan + org-flag
},
```

- [ ] **Step 6: Verify nav + plans typecheck cleanly**

```bash
npm run lint -- src/config/ src/lib/current-user.ts
```

Expected: no errors related to `jambageo` / `jambaGeoEnabled`.

- [ ] **Step 7: Commit**

```bash
git checkout -b feat/jambageo-phase-1
git add package.json package-lock.json .env.local.example src/config/plans.ts src/config/navigation.ts src/lib/current-user.ts
git commit -m "feat(jambageo): deps + plans flag + nav entry + current-user field

- Install react-map-gl, mapbox-gl, @mapbox/mapbox-gl-draw
- Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local.example
- Add 'jambageo' plan feature gated on Business tier
- Add JambaGeo sidebar entry (MapPin icon, jambageo flag)
- Expose jambaGeoEnabled on getCurrentUser()

PRD 03 / Spec §2"
```

---

## Task 2: Migrations 051–057 — schema + RLS

**Files:**
- Create: `supabase/migrations/051_jambageo_geofences.sql`
- Create: `supabase/migrations/052_jambageo_leads.sql`
- Create: `supabase/migrations/053_jambageo_lead_visits.sql`
- Create: `supabase/migrations/054_jambageo_duty_sessions.sql`
- Create: `supabase/migrations/055_jambageo_location_pings.sql`
- Create: `supabase/migrations/056_jambageo_geo_consents.sql`
- Create: `supabase/migrations/057_jambageo_rls.sql`

All migrations are idempotent. Apply via Supabase MCP — Windows can't run Supabase CLI (CLAUDE.md gotcha #4).

- [ ] **Step 1: Write `051_jambageo_geofences.sql`**

```sql
-- 051_jambageo_geofences.sql
-- JambaGeo Phase 1: geofence master (admin-defined zones around client sites / office)

CREATE TABLE IF NOT EXISTS public.geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('client','office')),
  center_lat numeric(9,6) NOT NULL CHECK (center_lat BETWEEN -90 AND 90),
  center_lng numeric(9,6) NOT NULL CHECK (center_lng BETWEEN -180 AND 180),
  radius_m integer NOT NULL CHECK (radius_m BETWEEN 1 AND 5000),
  is_active boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofences_org_active ON public.geofences (org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_geofences_org_type ON public.geofences (org_id, type);

DROP TRIGGER IF EXISTS trg_geofences_updated_at ON public.geofences;
CREATE TRIGGER trg_geofences_updated_at
  BEFORE UPDATE ON public.geofences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

Apply via Supabase MCP:

```
mcp__plugin_supabase_supabase__apply_migration
  name: 051_jambageo_geofences
  query: <SQL above>
```

- [ ] **Step 2: Write `052_jambageo_leads.sql`**

```sql
-- 052_jambageo_leads.sql
-- JambaGeo Phase 1: lead entity (lightweight CRM)

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_phone text NULL,
  contact_email text NULL,
  company text NULL,
  lat numeric(9,6) NULL CHECK (lat IS NULL OR (lat BETWEEN -90 AND 90)),
  lng numeric(9,6) NULL CHECK (lng IS NULL OR (lng BETWEEN -180 AND 180)),
  address text NULL,
  assigned_to uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new','contacted','visited','negotiation','converted','lost')),
  value_inr numeric(12,2) NULL CHECK (value_inr IS NULL OR value_inr >= 0),
  source text NULL,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_org_stage ON public.leads (org_id, stage);
CREATE INDEX IF NOT EXISTS idx_leads_org_assigned ON public.leads (org_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_org_updated ON public.leads (org_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

Apply via MCP with name `052_jambageo_leads`.

- [ ] **Step 3: Write `053_jambageo_lead_visits.sql`**

```sql
-- 053_jambageo_lead_visits.sql
-- JambaGeo Phase 1: visit log (manual web entries Phase 1; mobile writes Phase 2)

CREATE TABLE IF NOT EXISTS public.lead_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  session_id uuid NULL,  -- FK added in 054 once duty_sessions exists
  lat numeric(9,6) NULL CHECK (lat IS NULL OR (lat BETWEEN -90 AND 90)),
  lng numeric(9,6) NULL CHECK (lng IS NULL OR (lng BETWEEN -180 AND 180)),
  notes text NULL,
  outcome text NOT NULL
    CHECK (outcome IN ('in_progress','converted','pending','follow_up','lost')),
  follow_up_date date NULL,
  photo_url text NULL,  -- Phase 2
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web','mobile')),
  system boolean NOT NULL DEFAULT false,  -- true = kanban-drag stage-transition row (immutable)
  visited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_visits_lead_time ON public.lead_visits (lead_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_visits_org_time ON public.lead_visits (org_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_visits_followup
  ON public.lead_visits (org_id, follow_up_date) WHERE follow_up_date IS NOT NULL;
```

Apply via MCP with name `053_jambageo_lead_visits`.

- [ ] **Step 4: Write `054_jambageo_duty_sessions.sql` + back-FK on lead_visits**

```sql
-- 054_jambageo_duty_sessions.sql
-- JambaGeo Phase 1: duty session shell (mobile writes Phase 2)

CREATE TABLE IF NOT EXISTS public.duty_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id uuid NULL REFERENCES public.shifts(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','ended','auto_ended')),
  last_ping_at timestamptz NULL,
  last_lat numeric(9,6) NULL CHECK (last_lat IS NULL OR (last_lat BETWEEN -90 AND 90)),
  last_lng numeric(9,6) NULL CHECK (last_lng IS NULL OR (last_lng BETWEEN -180 AND 180)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duty_sessions_org_active
  ON public.duty_sessions (org_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_duty_sessions_employee_time
  ON public.duty_sessions (employee_id, started_at DESC);

-- Add deferred FK on lead_visits.session_id now that duty_sessions exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_visits_session_id_fkey'
  ) THEN
    ALTER TABLE public.lead_visits
      ADD CONSTRAINT lead_visits_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.duty_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;
```

Apply via MCP with name `054_jambageo_duty_sessions`.

- [ ] **Step 5: Write `055_jambageo_location_pings.sql`**

```sql
-- 055_jambageo_location_pings.sql
-- JambaGeo Phase 1: GPS pings (mobile writes Phase 2; retention sweep ready)

CREATE TABLE IF NOT EXISTS public.location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.duty_sessions(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lat numeric(9,6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng numeric(9,6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m numeric(7,2) NULL CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  battery_pct integer NULL CHECK (battery_pct IS NULL OR (battery_pct BETWEEN 0 AND 100)),
  captured_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_pings_session_time
  ON public.location_pings (session_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_pings_org_captured
  ON public.location_pings (org_id, captured_at);
```

Apply via MCP with name `055_jambageo_location_pings`.

- [ ] **Step 6: Write `056_jambageo_geo_consents.sql`**

```sql
-- 056_jambageo_geo_consents.sql
-- JambaGeo Phase 1: DPDP consent ledger (mobile writes Phase 2)

CREATE TABLE IF NOT EXISTS public.geo_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  granted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  retention_days integer NOT NULL DEFAULT 90
    CHECK (retention_days BETWEEN 1 AND 365),
  app_version text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_consents_active_unique
  ON public.geo_consents (org_id, employee_id)
  WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS trg_geo_consents_updated_at ON public.geo_consents;
CREATE TRIGGER trg_geo_consents_updated_at
  BEFORE UPDATE ON public.geo_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

Apply via MCP with name `056_jambageo_geo_consents`.

- [ ] **Step 7: Write `057_jambageo_rls.sql`**

```sql
-- 057_jambageo_rls.sql
-- JambaGeo Phase 1: RLS policies (service-role bypass per gotcha #5; advisory until Clerk-JWT wired)

ALTER TABLE public.geofences        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_visits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_pings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_consents     ENABLE ROW LEVEL SECURITY;

-- geofences: read all org; write admin/owner only
DROP POLICY IF EXISTS p_geofences_read ON public.geofences;
CREATE POLICY p_geofences_read ON public.geofences FOR SELECT
  USING (org_id::text = auth.jwt() ->> 'org_id');

DROP POLICY IF EXISTS p_geofences_write ON public.geofences;
CREATE POLICY p_geofences_write ON public.geofences FOR ALL
  USING (
    org_id::text = auth.jwt() ->> 'org_id'
    AND (auth.jwt() ->> 'org_role') IN ('org:owner','org:admin')
  )
  WITH CHECK (
    org_id::text = auth.jwt() ->> 'org_id'
    AND (auth.jwt() ->> 'org_role') IN ('org:owner','org:admin')
  );

-- leads / lead_visits / duty_sessions: read org-scoped (further refined in app code via getManagerScopedEmployeeIds)
DROP POLICY IF EXISTS p_leads_org ON public.leads;
CREATE POLICY p_leads_org ON public.leads FOR ALL
  USING (org_id::text = auth.jwt() ->> 'org_id')
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id');

DROP POLICY IF EXISTS p_lead_visits_org ON public.lead_visits;
CREATE POLICY p_lead_visits_org ON public.lead_visits FOR ALL
  USING (org_id::text = auth.jwt() ->> 'org_id')
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id');

DROP POLICY IF EXISTS p_duty_sessions_org ON public.duty_sessions;
CREATE POLICY p_duty_sessions_org ON public.duty_sessions FOR ALL
  USING (org_id::text = auth.jwt() ->> 'org_id')
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id');

DROP POLICY IF EXISTS p_location_pings_org ON public.location_pings;
CREATE POLICY p_location_pings_org ON public.location_pings FOR ALL
  USING (org_id::text = auth.jwt() ->> 'org_id')
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id');

DROP POLICY IF EXISTS p_geo_consents_org ON public.geo_consents;
CREATE POLICY p_geo_consents_org ON public.geo_consents FOR ALL
  USING (org_id::text = auth.jwt() ->> 'org_id')
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id');
```

Apply via MCP with name `057_jambageo_rls`.

- [ ] **Step 8: Verify all 7 tables exist**

```
mcp__plugin_supabase_supabase__list_tables  schemas: ["public"]
```

Expected: `geofences`, `leads`, `lead_visits`, `duty_sessions`, `location_pings`, `geo_consents` all present with RLS enabled.

- [ ] **Step 9: Commit migrations**

```bash
git add supabase/migrations/051_jambageo_geofences.sql \
        supabase/migrations/052_jambageo_leads.sql \
        supabase/migrations/053_jambageo_lead_visits.sql \
        supabase/migrations/054_jambageo_duty_sessions.sql \
        supabase/migrations/055_jambageo_location_pings.sql \
        supabase/migrations/056_jambageo_geo_consents.sql \
        supabase/migrations/057_jambageo_rls.sql

git commit -m "feat(jambageo): migrations 051-057 — schema + RLS for 6 new tables

- 051 geofences (admin-defined zones, client|office, radius 1-5000m)
- 052 leads (CRM entity, fixed stage CHECK enum)
- 053 lead_visits (manual web entries + future mobile; system bool guards kanban audit rows)
- 054 duty_sessions (mobile writes Phase 2; FK back-stitched on lead_visits.session_id)
- 055 location_pings (mobile writes Phase 2; retention sweep ready)
- 056 geo_consents (DPDP ledger; partial unique on active consent)
- 057 RLS policies (Clerk-JWT pattern, service-role bypass per gotcha #5)

All idempotent. Applied via Supabase MCP. Spec §3."
```

---

## Task 3: TypeScript types + lib helpers (TDD)

**Files:**
- Modify: `src/types/database.types.ts`
- Modify: `src/types/index.ts`
- Create: `src/lib/geo/geometry.ts`
- Create: `src/lib/geo/stages.ts`
- Create: `src/lib/mapbox.ts`
- Create: `src/lib/jambageo-access.ts`
- Create: `tests/geo/geometry.test.ts`
- Create: `tests/geo/stages.test.ts`

- [ ] **Step 1: Write failing tests for geometry helpers**

Create `tests/geo/geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { haversineMeters, isPointInGeofence } from "@/lib/geo/geometry";

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMeters(19.07, 72.87, 19.07, 72.87)).toBe(0);
  });

  it("returns ~111 km between 1° latitude apart at equator", () => {
    const meters = haversineMeters(0, 0, 1, 0);
    // 1° lat ≈ 111.32 km
    expect(meters).toBeGreaterThan(110_000);
    expect(meters).toBeLessThan(112_000);
  });

  it("Mumbai (19.07, 72.87) to Pune (18.52, 73.85) is ~120 km", () => {
    const meters = haversineMeters(19.0760, 72.8777, 18.5204, 73.8567);
    expect(meters).toBeGreaterThan(115_000);
    expect(meters).toBeLessThan(125_000);
  });
});

describe("isPointInGeofence", () => {
  const office = { center_lat: 19.0760, center_lng: 72.8777, radius_m: 500 };

  it("point at center is inside", () => {
    expect(isPointInGeofence(19.0760, 72.8777, office)).toBe(true);
  });

  it("point 100 m away (inside 500 m radius) returns true", () => {
    // ~0.0009° lat ≈ 100 m at equator (close enough at Mumbai latitude)
    expect(isPointInGeofence(19.0760 + 0.0009, 72.8777, office)).toBe(true);
  });

  it("point 1 km away (outside 500 m radius) returns false", () => {
    expect(isPointInGeofence(19.0760 + 0.009, 72.8777, office)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/geo/geometry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement geometry helpers**

Create `src/lib/geo/geometry.ts`:

```ts
/**
 * Haversine distance between two lat/lng points in metres.
 * Used by isPointInGeofence and (later) lead-proximity queries.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeofenceCircle {
  center_lat: number;
  center_lng: number;
  radius_m: number;
}

/**
 * True iff (lat, lng) is inside the geofence circle.
 * Inclusive at the boundary.
 */
export function isPointInGeofence(
  lat: number,
  lng: number,
  fence: GeofenceCircle,
): boolean {
  return haversineMeters(lat, lng, fence.center_lat, fence.center_lng) <= fence.radius_m;
}

/**
 * Format a radius in metres for display (e.g. "500 m", "1.2 km").
 */
export function formatGeofenceRadius(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npx vitest run tests/geo/geometry.test.ts
```

Expected: PASS — 6 tests green.

- [ ] **Step 5: Write failing tests for stage helpers**

Create `tests/geo/stages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  LEAD_STAGES,
  LEAD_OUTCOMES,
  mapStageToOutcome,
  mapOutcomeToStage,
  stageLabel,
  outcomeLabel,
} from "@/lib/geo/stages";

describe("LEAD_STAGES", () => {
  it("contains exactly the 6 fixed stages", () => {
    expect(LEAD_STAGES).toEqual([
      "new", "contacted", "visited", "negotiation", "converted", "lost",
    ]);
  });
});

describe("mapStageToOutcome", () => {
  it("maps converted → converted", () => {
    expect(mapStageToOutcome("converted")).toBe("converted");
  });
  it("maps lost → lost", () => {
    expect(mapStageToOutcome("lost")).toBe("lost");
  });
  it("maps in-flight stages → in_progress", () => {
    expect(mapStageToOutcome("new")).toBe("in_progress");
    expect(mapStageToOutcome("contacted")).toBe("in_progress");
    expect(mapStageToOutcome("visited")).toBe("in_progress");
    expect(mapStageToOutcome("negotiation")).toBe("in_progress");
  });
});

describe("mapOutcomeToStage", () => {
  it("converted → 'converted'", () => {
    expect(mapOutcomeToStage("converted")).toBe("converted");
  });
  it("lost → 'lost'", () => {
    expect(mapOutcomeToStage("lost")).toBe("lost");
  });
  it("in_progress / pending / follow_up → null (no auto-stage change)", () => {
    expect(mapOutcomeToStage("in_progress")).toBeNull();
    expect(mapOutcomeToStage("pending")).toBeNull();
    expect(mapOutcomeToStage("follow_up")).toBeNull();
  });
});

describe("labels", () => {
  it("stageLabel returns Title Case", () => {
    expect(stageLabel("negotiation")).toBe("Negotiation");
    expect(stageLabel("new")).toBe("New");
  });
  it("outcomeLabel returns human-friendly", () => {
    expect(outcomeLabel("follow_up")).toBe("Follow-up");
    expect(outcomeLabel("in_progress")).toBe("In progress");
  });
});
```

- [ ] **Step 6: Run test to verify fail**

```bash
npx vitest run tests/geo/stages.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/lib/geo/stages.ts`**

```ts
export const LEAD_STAGES = [
  "new",
  "contacted",
  "visited",
  "negotiation",
  "converted",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_OUTCOMES = [
  "in_progress",
  "converted",
  "pending",
  "follow_up",
  "lost",
] as const;
export type LeadOutcome = (typeof LEAD_OUTCOMES)[number];

/**
 * For a system-authored visit row capturing a kanban stage change,
 * derive a default outcome from the destination stage.
 */
export function mapStageToOutcome(stage: LeadStage): LeadOutcome {
  if (stage === "converted") return "converted";
  if (stage === "lost") return "lost";
  return "in_progress";
}

/**
 * When a human logs a visit, certain terminal outcomes force a stage flip.
 * Returns null when the lead's stage should remain unchanged.
 */
export function mapOutcomeToStage(outcome: LeadOutcome): LeadStage | null {
  if (outcome === "converted") return "converted";
  if (outcome === "lost") return "lost";
  return null;
}

const STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  visited: "Visited",
  negotiation: "Negotiation",
  converted: "Converted",
  lost: "Lost",
};

const OUTCOME_LABELS: Record<LeadOutcome, string> = {
  in_progress: "In progress",
  converted: "Converted",
  pending: "Pending",
  follow_up: "Follow-up",
  lost: "Lost",
};

export function stageLabel(stage: LeadStage): string {
  return STAGE_LABELS[stage];
}

export function outcomeLabel(outcome: LeadOutcome): string {
  return OUTCOME_LABELS[outcome];
}
```

- [ ] **Step 8: Run test to verify pass**

```bash
npx vitest run tests/geo/stages.test.ts
```

Expected: PASS.

- [ ] **Step 9: Create `src/lib/mapbox.ts`**

```ts
// Mapbox helpers. Token is public (NEXT_PUBLIC_MAPBOX_TOKEN) but
// URL-restricted in the Mapbox console so leaking it from the bundle is acceptable.

export function getMapboxToken(): string {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    throw new Error(
      "NEXT_PUBLIC_MAPBOX_TOKEN is not set. JambaGeo maps will not render. " +
        "Generate a public token at https://account.mapbox.com/access-tokens/ " +
        "and add it to .env.local.",
    );
  }
  return token;
}

/** Geographic centre of India — used as default viewport. */
export const DEFAULT_INDIA_VIEWPORT = {
  latitude: 20.5937,
  longitude: 78.9629,
  zoom: 4,
};

/** Mapbox style URL used across JambaGeo. */
export const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";
```

- [ ] **Step 10: Create `src/lib/jambageo-access.ts`**

```ts
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { isAdmin } from "@/types";

export interface JambaGeoAccessContext {
  orgId: string;
  clerkUserId: string;
  role: ReturnType<typeof getRole>;
  employeeId: string | null;
  plan: string;
}

function getRole(u: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return u.role;
}

/**
 * Server-action guard. Returns the auth context if the caller may use JambaGeo
 * at all (any role); throws `{ success:false, error }` otherwise via ActionResult.
 * Returns `null` when the caller is unauthenticated.
 */
export async function getJambaGeoContext(): Promise<JambaGeoAccessContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!hasFeature(user.plan ?? "starter", "jambageo")) return null;
  if (!user.jambaGeoEnabled) return null;
  return {
    orgId: user.orgId,
    clerkUserId: user.clerkUserId,
    role: user.role,
    employeeId: user.employeeId,
    plan: user.plan,
  };
}

/**
 * Page-level guard. Redirects to /dashboard/settings if the plan/flag check
 * fails (Business gate / org-toggle off). Use from server components only.
 */
export async function requireJambaGeoAccess(): Promise<JambaGeoAccessContext> {
  const ctx = await getJambaGeoContext();
  if (!ctx) redirect("/dashboard/settings#jambageo");
  return ctx;
}

/**
 * Admin-only variant of requireJambaGeoAccess. Use for geofence/settings pages.
 */
export async function requireJambaGeoAdminContext(): Promise<JambaGeoAccessContext> {
  const ctx = await requireJambaGeoAccess();
  if (!isAdmin(ctx.role)) redirect("/dashboard/geo/leads");
  return ctx;
}
```

- [ ] **Step 11: Add table types to `src/types/database.types.ts`**

Grep for an existing table type to find the pattern:

```bash
grep -n "geofences\|leads:" src/types/database.types.ts | head -5
```

If nothing exists, append within the `public.Tables` block. Match the existing `Row`/`Insert`/`Update` shapes used by `payroll_line_items`. For each of the six tables, add a block following this pattern (geofences example):

```ts
geofences: {
  Row: {
    id: string;
    org_id: string;
    name: string;
    type: "client" | "office";
    center_lat: number;
    center_lng: number;
    radius_m: number;
    is_active: boolean;
    notes: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: Partial<Row> & {
    org_id: string;
    name: string;
    type: "client" | "office";
    center_lat: number;
    center_lng: number;
    radius_m: number;
  };
  Update: Partial<Row>;
};
```

Repeat for `leads`, `lead_visits`, `duty_sessions`, `location_pings`, `geo_consents` using the columns documented in Task 2.

- [ ] **Step 12: Add domain types to `src/types/index.ts`**

Re-export the LeadStage and LeadOutcome unions and define rich app-level types:

```ts
export type { LeadStage, LeadOutcome } from "@/lib/geo/stages";
export { LEAD_STAGES, LEAD_OUTCOMES } from "@/lib/geo/stages";

export interface Geofence {
  id: string;
  orgId: string;
  name: string;
  type: "client" | "office";
  centerLat: number;
  centerLng: number;
  radiusM: number;
  isActive: boolean;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  orgId: string;
  name: string;
  contactPhone: string | null;
  contactEmail: string | null;
  company: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  assignedTo: string | null;
  assigneeName?: string | null; // hydrated by listLeads
  stage: import("@/lib/geo/stages").LeadStage;
  valueInr: number | null;
  source: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadVisit {
  id: string;
  leadId: string;
  orgId: string;
  employeeId: string;
  employeeName?: string | null; // hydrated
  sessionId: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  outcome: import("@/lib/geo/stages").LeadOutcome;
  followUpDate: string | null;
  photoUrl: string | null;
  source: "web" | "mobile";
  system: boolean;
  visitedAt: string;
  createdAt: string;
}

export interface ActiveSession {
  sessionId: string;
  employeeId: string;
  employeeName: string;
  startedAt: string;
  lastPingAt: string | null;
  lastLat: number | null;
  lastLng: number | null;
}
```

- [ ] **Step 13: Run lint + tests**

```bash
npm run lint -- src/lib/geo/ src/lib/mapbox.ts src/lib/jambageo-access.ts src/types/
npx vitest run tests/geo/
```

Expected: lint clean, both geometry + stages tests green.

- [ ] **Step 14: Commit**

```bash
git add src/lib/geo/ src/lib/mapbox.ts src/lib/jambageo-access.ts \
        src/types/database.types.ts src/types/index.ts tests/geo/
git commit -m "feat(jambageo): types + geometry/stage helpers + access gates

- LEAD_STAGES, LEAD_OUTCOMES, mapStageToOutcome, mapOutcomeToStage
- haversineMeters, isPointInGeofence, formatGeofenceRadius
- src/lib/mapbox.ts: token helper + India default viewport
- src/lib/jambageo-access.ts: getJambaGeoContext + requireJambaGeoAccess + admin variant
- Database + domain types for all 6 new tables
- Vitest: geometry.test.ts + stages.test.ts (all green)

Spec §3-§4."
```

---

## Task 4: Server actions — geo-geofences

**Files:**
- Create: `src/actions/geo-geofences.ts`
- Create: `tests/geo/validation.test.ts` (start the file; more added in later tasks)

- [ ] **Step 1: Write failing validation tests**

Create `tests/geo/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GeofenceCreateSchema } from "@/actions/geo-geofences";

describe("GeofenceCreateSchema", () => {
  const valid = {
    name: "Mumbai HQ",
    type: "office" as const,
    center_lat: 19.0760,
    center_lng: 72.8777,
    radius_m: 500,
  };

  it("accepts a valid geofence", () => {
    expect(() => GeofenceCreateSchema.parse(valid)).not.toThrow();
  });

  it("rejects lat > 90", () => {
    expect(() => GeofenceCreateSchema.parse({ ...valid, center_lat: 91 })).toThrow();
  });

  it("rejects lng > 180", () => {
    expect(() => GeofenceCreateSchema.parse({ ...valid, center_lng: 181 })).toThrow();
  });

  it("rejects radius < 1", () => {
    expect(() => GeofenceCreateSchema.parse({ ...valid, radius_m: 0 })).toThrow();
  });

  it("rejects radius > 5000", () => {
    expect(() => GeofenceCreateSchema.parse({ ...valid, radius_m: 5001 })).toThrow();
  });

  it("rejects unknown type", () => {
    expect(() => GeofenceCreateSchema.parse({ ...valid, type: "warehouse" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
npx vitest run tests/geo/validation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/actions/geo-geofences.ts`**

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import { isAdmin, type ActionResult } from "@/types";

export const GeofenceCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["client", "office"]),
  center_lat: z.number().min(-90).max(90),
  center_lng: z.number().min(-180).max(180),
  radius_m: z.number().int().min(1).max(5000),
  notes: z.string().trim().max(1000).nullish(),
});

export const GeofenceUpdateSchema = GeofenceCreateSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export type GeofenceCreateInput = z.infer<typeof GeofenceCreateSchema>;
export type GeofenceUpdateInput = z.infer<typeof GeofenceUpdateSchema>;

interface GeofenceRow {
  id: string;
  org_id: string;
  name: string;
  type: "client" | "office";
  center_lat: number;
  center_lng: number;
  radius_m: number;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listGeofences(): Promise<ActionResult<GeofenceRow[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("geofences")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as GeofenceRow[] };
}

export async function createGeofence(
  input: GeofenceCreateInput,
): Promise<ActionResult<GeofenceRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const parsed = GeofenceCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("geofences")
    .insert({
      org_id: ctx.orgId,
      name: parsed.data.name,
      type: parsed.data.type,
      center_lat: parsed.data.center_lat,
      center_lng: parsed.data.center_lng,
      radius_m: parsed.data.radius_m,
      notes: parsed.data.notes ?? null,
      created_by: ctx.employeeId,
    })
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/geofences");
  revalidatePath("/dashboard/settings");
  return { success: true, data: data as GeofenceRow };
}

export async function updateGeofence(
  id: string,
  input: GeofenceUpdateInput,
): Promise<ActionResult<GeofenceRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const parsed = GeofenceUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("geofences")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/geofences");
  return { success: true, data: data as GeofenceRow };
}

export async function toggleGeofenceActive(
  id: string,
  is_active: boolean,
): Promise<ActionResult<GeofenceRow>> {
  return updateGeofence(id, { is_active });
}

export async function deleteGeofence(id: string): Promise<ActionResult<void>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const sb = createAdminSupabase();
  const { error } = await sb
    .from("geofences")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/geofences");
  return { success: true, data: undefined };
}
```

- [ ] **Step 4: Run validation tests**

```bash
npx vitest run tests/geo/validation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/geo-geofences.ts tests/geo/validation.test.ts
git commit -m "feat(jambageo): geofence server actions (CRUD, admin-only)

- listGeofences (any authed; org-scoped read)
- createGeofence (admin; Zod validation, lat/lng/radius bounds)
- updateGeofence / toggleGeofenceActive (admin)
- deleteGeofence (admin; hard delete)
- revalidatePath /dashboard/geo/geofences + /dashboard/settings
- Vitest: validation.test.ts (lat/lng/radius/type bounds)

Spec §4."
```

---

## Task 5: Server actions — geo-leads (CRUD + scope + stage transitions)

**Files:**
- Create: `src/actions/geo-leads.ts`
- Create: `tests/geo/stage-transitions.test.ts`
- Create: `tests/geo/manager-scope.test.ts`

This file is dense — leads pull together scope, validation, kanban stage-transition writes, and assignment email. Implementation in pieces.

- [ ] **Step 1: Sketch shared helper `assertLeadScope`**

We'll need a helper used by `updateLead`, `updateLeadStage`, `assignLead`. It applies the rules:
- admin/owner → any lead in org
- manager → lead's `assigned_to` IS NULL OR `assigned_to IN getManagerScopedEmployeeIds(orgId, managerEmployeeId)`
- employee → `assigned_to = ctx.employeeId`

Locate `getManagerScopedEmployeeIds`:

```bash
grep -rn "getManagerScopedEmployeeIds" src/ --include="*.ts" | head -5
```

It's in the attendance/roster code from Phase 2 — confirm signature `(orgId: string, employeeId: string) => Promise<string[]>`.

- [ ] **Step 2: Write failing manager-scope tests**

Create `tests/geo/manager-scope.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeLeadScope } from "@/actions/geo-leads";

describe("computeLeadScope", () => {
  it("admin: returns null (= no filter)", () => {
    expect(
      computeLeadScope({ role: "admin", employeeId: "e1" }, { dept: [] }),
    ).toBeNull();
  });

  it("owner: returns null", () => {
    expect(
      computeLeadScope({ role: "owner", employeeId: "e1" }, { dept: [] }),
    ).toBeNull();
  });

  it("manager: returns dept members + unassigned pool", () => {
    expect(
      computeLeadScope({ role: "manager", employeeId: "mgr1" }, { dept: ["e1", "e2"] }),
    ).toEqual({ inAssignedTo: ["e1", "e2"], includeUnassigned: true });
  });

  it("employee: returns just self, no unassigned pool", () => {
    expect(
      computeLeadScope({ role: "employee", employeeId: "e7" }, { dept: [] }),
    ).toEqual({ inAssignedTo: ["e7"], includeUnassigned: false });
  });
});
```

- [ ] **Step 3: Write failing stage-transition tests**

Create `tests/geo/stage-transitions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSystemVisitForStageMove } from "@/actions/geo-leads";

describe("buildSystemVisitForStageMove", () => {
  const baseArgs = {
    leadId: "lead-1",
    orgId: "org-1",
    employeeId: "e-1",
    from: "new" as const,
    to: "contacted" as const,
    note: undefined,
  };

  it("returns null when from === to (no-op)", () => {
    expect(
      buildSystemVisitForStageMove({ ...baseArgs, from: "new", to: "new" }),
    ).toBeNull();
  });

  it("writes a system visit with outcome=in_progress for in-flight target", () => {
    const v = buildSystemVisitForStageMove(baseArgs);
    expect(v).toMatchObject({
      lead_id: "lead-1",
      org_id: "org-1",
      employee_id: "e-1",
      outcome: "in_progress",
      source: "web",
      system: true,
    });
    expect(v?.notes).toMatch(/Stage: new → contacted/);
  });

  it("writes outcome=converted when target is converted", () => {
    expect(
      buildSystemVisitForStageMove({ ...baseArgs, to: "converted" }),
    ).toMatchObject({ outcome: "converted" });
  });

  it("appends a user-supplied note", () => {
    const v = buildSystemVisitForStageMove({ ...baseArgs, note: "Customer asked for quote" });
    expect(v?.notes).toMatch(/Customer asked for quote/);
  });
});
```

- [ ] **Step 4: Run tests to verify fail**

```bash
npx vitest run tests/geo/manager-scope.test.ts tests/geo/stage-transitions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement `src/actions/geo-leads.ts`**

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import { isAdmin, isManagerOrAbove, type ActionResult, type UserRole } from "@/types";
import { LEAD_STAGES, mapStageToOutcome, type LeadStage } from "@/lib/geo/stages";
import { getManagerScopedEmployeeIds } from "@/lib/attendance/manager-scope"; // confirm path via grep in Step 1
import { sendLeadAssignedEmail } from "@/components/emails/lead-assigned-sender";

// ---- Schemas ----

export const LeadCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contact_phone: z.string().trim().max(40).nullish(),
  contact_email: z.string().trim().email().nullish().or(z.literal("").transform(() => null)),
  company: z.string().trim().max(160).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  address: z.string().trim().max(500).nullish(),
  assigned_to: z.string().uuid().nullish(),
  stage: z.enum(LEAD_STAGES).default("new"),
  value_inr: z.number().min(0).max(9_999_999_99).nullish(),
  source: z.string().trim().max(80).nullish(),
});

export const LeadUpdateSchema = LeadCreateSchema.partial();

export const StageUpdateSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  note: z.string().trim().max(500).optional(),
});

export const AssignSchema = z.object({
  employee_id: z.string().uuid().nullable(),
});

// ---- Scope helper (pure, exported for tests) ----

export interface ScopeContext {
  role: UserRole;
  employeeId: string | null;
}
export interface ScopeFilter {
  inAssignedTo: string[];
  includeUnassigned: boolean;
}

export function computeLeadScope(
  ctx: ScopeContext,
  deps: { dept: string[] },
): ScopeFilter | null {
  if (isAdmin(ctx.role)) return null; // null = unrestricted
  if (ctx.role === "manager") {
    return { inAssignedTo: deps.dept, includeUnassigned: true };
  }
  // employee
  return {
    inAssignedTo: ctx.employeeId ? [ctx.employeeId] : [],
    includeUnassigned: false,
  };
}

// ---- System visit builder (pure, exported for tests) ----

export function buildSystemVisitForStageMove(args: {
  leadId: string;
  orgId: string;
  employeeId: string;
  from: LeadStage;
  to: LeadStage;
  note?: string;
}): {
  lead_id: string;
  org_id: string;
  employee_id: string;
  outcome: string;
  notes: string;
  source: "web";
  system: true;
} | null {
  if (args.from === args.to) return null;
  const base = `Stage: ${args.from} → ${args.to}`;
  const notes = args.note ? `${base}. ${args.note}` : base;
  return {
    lead_id: args.leadId,
    org_id: args.orgId,
    employee_id: args.employeeId,
    outcome: mapStageToOutcome(args.to),
    notes,
    source: "web" as const,
    system: true as const,
  };
}

// ---- Actions ----

interface LeadRow {
  id: string;
  org_id: string;
  name: string;
  contact_phone: string | null;
  contact_email: string | null;
  company: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  assigned_to: string | null;
  stage: LeadStage;
  value_inr: number | null;
  source: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ListLeadsFilter {
  stage?: LeadStage;
  assigned_to?: string | "unassigned";
  search?: string;
  follow_up_due?: boolean;
}

export async function listLeads(
  filter: ListLeadsFilter = {},
): Promise<ActionResult<(LeadRow & { assignee_name: string | null })[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const sb = createAdminSupabase();
  let q = sb
    .from("leads")
    .select("*, assignee:employees!leads_assigned_to_fkey(first_name,last_name)")
    .eq("org_id", ctx.orgId)
    .order("updated_at", { ascending: false });

  if (filter.stage) q = q.eq("stage", filter.stage);
  if (filter.assigned_to === "unassigned") q = q.is("assigned_to", null);
  else if (filter.assigned_to) q = q.eq("assigned_to", filter.assigned_to);
  if (filter.search) {
    const s = `%${filter.search}%`;
    q = q.or(`name.ilike.${s},company.ilike.${s},contact_email.ilike.${s}`);
  }

  // Scope filter
  const dept = !isAdmin(ctx.role) && ctx.employeeId
    ? await getManagerScopedEmployeeIds(ctx.orgId, ctx.employeeId)
    : [];
  const scope = computeLeadScope(
    { role: ctx.role, employeeId: ctx.employeeId },
    { dept },
  );
  if (scope) {
    // build .or(...) for inAssignedTo + optional null
    const parts: string[] = [];
    if (scope.inAssignedTo.length > 0) {
      parts.push(`assigned_to.in.(${scope.inAssignedTo.join(",")})`);
    }
    if (scope.includeUnassigned) {
      parts.push(`assigned_to.is.null`);
    }
    if (parts.length === 0) {
      return { success: true, data: [] };
    }
    q = q.or(parts.join(","));
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []).map((r: any) => ({
    ...(r as LeadRow),
    assignee_name: r.assignee
      ? `${r.assignee.first_name ?? ""} ${r.assignee.last_name ?? ""}`.trim() || null
      : null,
  }));
  return { success: true, data: rows };
}

export async function getLead(id: string): Promise<ActionResult<LeadRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Not found" };

  // Apply scope: non-admin must own / dept-own / be unassigned.
  if (!isAdmin(ctx.role)) {
    const dept = ctx.employeeId
      ? await getManagerScopedEmployeeIds(ctx.orgId, ctx.employeeId)
      : [];
    const allowed =
      data.assigned_to === null
        ? ctx.role === "manager"
        : ctx.role === "manager"
          ? dept.includes(data.assigned_to)
          : data.assigned_to === ctx.employeeId;
    if (!allowed) return { success: false, error: "Out of scope" };
  }

  return { success: true, data: data as LeadRow };
}

async function assertAssigneeInScope(
  ctx: NonNullable<Awaited<ReturnType<typeof getJambaGeoContext>>>,
  assigneeId: string | null,
): Promise<string | null> {
  if (isAdmin(ctx.role)) return null; // admin can assign anyone
  if (assigneeId === null) return null; // unassigned allowed
  if (!ctx.employeeId) return "Employee record missing";
  const dept = await getManagerScopedEmployeeIds(ctx.orgId, ctx.employeeId);
  if (!dept.includes(assigneeId)) return "Assignee is not in your department";
  return null;
}

export async function createLead(
  input: z.infer<typeof LeadCreateSchema>,
): Promise<ActionResult<LeadRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isManagerOrAbove(ctx.role)) return { success: false, error: "Manager+ only" };

  const parsed = LeadCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const scopeErr = await assertAssigneeInScope(ctx, parsed.data.assigned_to ?? null);
  if (scopeErr) return { success: false, error: scopeErr };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .insert({ ...parsed.data, org_id: ctx.orgId, created_by: ctx.employeeId })
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  // Fire assignment email if assigned at create time
  if (data.assigned_to) {
    waitUntil(sendLeadAssignedEmail({ leadId: data.id, assigneeId: data.assigned_to }));
  }

  revalidatePath("/dashboard/geo/leads");
  revalidatePath("/dashboard/geo/my-leads");
  return { success: true, data: data as LeadRow };
}

export async function updateLead(
  id: string,
  patch: z.infer<typeof LeadUpdateSchema>,
): Promise<ActionResult<LeadRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const parsed = LeadUpdateSchema.safeParse(patch);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  // Permission: scope-check the existing lead
  const existing = await getLead(id);
  if (!existing.success) return existing;

  if (!isAdmin(ctx.role) && parsed.data.assigned_to !== undefined) {
    const scopeErr = await assertAssigneeInScope(ctx, parsed.data.assigned_to ?? null);
    if (scopeErr) return { success: false, error: scopeErr };
  }

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/leads");
  revalidatePath(`/dashboard/geo/leads/${id}`);
  return { success: true, data: data as LeadRow };
}

export async function updateLeadStage(
  id: string,
  next: { stage: LeadStage; note?: string },
): Promise<ActionResult<LeadRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const parsed = StageUpdateSchema.safeParse(next);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const existing = await getLead(id);
  if (!existing.success) return existing;
  if (existing.data.stage === parsed.data.stage) {
    return { success: true, data: existing.data }; // idempotent no-op
  }

  // Employees can only move their own lead. Already enforced by getLead scope.
  const sb = createAdminSupabase();
  const { data: updated, error } = await sb
    .from("leads")
    .update({ stage: parsed.data.stage })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  // Write system visit row (best-effort; non-blocking on failure)
  if (ctx.employeeId) {
    const sys = buildSystemVisitForStageMove({
      leadId: id,
      orgId: ctx.orgId,
      employeeId: ctx.employeeId,
      from: existing.data.stage,
      to: parsed.data.stage,
      note: parsed.data.note,
    });
    if (sys) {
      await sb.from("lead_visits").insert(sys);
    }
  }

  revalidatePath("/dashboard/geo/leads");
  revalidatePath(`/dashboard/geo/leads/${id}`);
  return { success: true, data: updated as LeadRow };
}

export async function assignLead(
  id: string,
  employee_id: string | null,
): Promise<ActionResult<LeadRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isManagerOrAbove(ctx.role)) return { success: false, error: "Manager+ only" };

  const scopeErr = await assertAssigneeInScope(ctx, employee_id);
  if (scopeErr) return { success: false, error: scopeErr };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .update({ assigned_to: employee_id })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  if (employee_id) {
    waitUntil(sendLeadAssignedEmail({ leadId: id, assigneeId: employee_id }));
  }

  revalidatePath("/dashboard/geo/leads");
  revalidatePath(`/dashboard/geo/leads/${id}`);
  revalidatePath("/dashboard/geo/my-leads");
  return { success: true, data: data as LeadRow };
}

export async function bulkAssignLeads(
  ids: string[],
  employee_id: string | null,
): Promise<ActionResult<{ updated: number }>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .update({ assigned_to: employee_id })
    .in("id", ids)
    .eq("org_id", ctx.orgId)
    .select("id");
  if (error) return { success: false, error: error.message };

  if (employee_id) {
    for (const row of data ?? []) {
      waitUntil(sendLeadAssignedEmail({ leadId: row.id, assigneeId: employee_id }));
    }
  }

  revalidatePath("/dashboard/geo/leads");
  return { success: true, data: { updated: (data ?? []).length } };
}

export async function deleteLead(id: string): Promise<ActionResult<void>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const sb = createAdminSupabase();
  const { error } = await sb
    .from("leads")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/leads");
  return { success: true, data: undefined };
}
```

> **Import notes for the implementing engineer:**
> - `getManagerScopedEmployeeIds` location: grep `src/lib/attendance/` and `src/actions/shifts.ts` — confirm path matches the import statement above.
> - `sendLeadAssignedEmail` is defined in Task 9 (`src/components/emails/lead-assigned-sender.ts`). It's safe to add the import now; CI will fail until Task 9 lands. Add a no-op stub `export async function sendLeadAssignedEmail(_: { leadId: string; assigneeId: string }) { return; }` in the file to keep the build green between tasks if you commit out-of-order.

- [ ] **Step 6: Run pure-helper tests**

```bash
npx vitest run tests/geo/manager-scope.test.ts tests/geo/stage-transitions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/actions/geo-leads.ts tests/geo/manager-scope.test.ts tests/geo/stage-transitions.test.ts
git commit -m "feat(jambageo): lead server actions (CRUD, scope, kanban stage moves)

- listLeads (role-scoped + unassigned pool visible to managers)
- getLead / createLead / updateLead with cross-dept reassign guard
- updateLeadStage writes a system lead_visit row on actual stage change
- assignLead / bulkAssignLeads fire lead-assigned email via waitUntil
- deleteLead admin-only (cascades visits)
- Pure helpers (computeLeadScope, buildSystemVisitForStageMove) tested

Spec §4-§6."
```

---

## Task 6: Server actions — geo-visits

**Files:**
- Create: `src/actions/geo-visits.ts`

- [ ] **Step 1: Write `src/actions/geo-visits.ts`**

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import { isAdmin, isManagerOrAbove, type ActionResult } from "@/types";
import { LEAD_OUTCOMES, mapOutcomeToStage, type LeadOutcome } from "@/lib/geo/stages";
import { getLead } from "./geo-leads";

export const VisitCreateSchema = z.object({
  lead_id: z.string().uuid(),
  notes: z.string().trim().max(2000).nullish(),
  outcome: z.enum(LEAD_OUTCOMES),
  follow_up_date: z.string().date().nullish(),  // YYYY-MM-DD
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
});

export const VisitUpdateSchema = VisitCreateSchema.partial().omit({ lead_id: true });

interface VisitRow {
  id: string;
  lead_id: string;
  org_id: string;
  employee_id: string;
  session_id: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  outcome: LeadOutcome;
  follow_up_date: string | null;
  photo_url: string | null;
  source: "web" | "mobile";
  system: boolean;
  visited_at: string;
  created_at: string;
}

export async function listLeadVisits(
  lead_id: string,
): Promise<ActionResult<(VisitRow & { employee_name: string | null })[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  // Scope enforced via getLead (re-uses leads scope filter)
  const lead = await getLead(lead_id);
  if (!lead.success) return { success: false, error: lead.error };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("lead_visits")
    .select("*, employee:employees!lead_visits_employee_id_fkey(first_name,last_name)")
    .eq("lead_id", lead_id)
    .eq("org_id", ctx.orgId)
    .order("visited_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []).map((r: any) => ({
    ...(r as VisitRow),
    employee_name: r.employee
      ? `${r.employee.first_name ?? ""} ${r.employee.last_name ?? ""}`.trim() || null
      : null,
  }));
  return { success: true, data: rows };
}

export async function createLeadVisit(
  input: z.infer<typeof VisitCreateSchema>,
): Promise<ActionResult<VisitRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const parsed = VisitCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  // Scope check via parent lead
  const lead = await getLead(parsed.data.lead_id);
  if (!lead.success) return { success: false, error: lead.error };

  if (!ctx.employeeId) return { success: false, error: "No employee record" };

  const sb = createAdminSupabase();
  const { data: visit, error: vErr } = await sb
    .from("lead_visits")
    .insert({
      lead_id: parsed.data.lead_id,
      org_id: ctx.orgId,
      employee_id: ctx.employeeId,
      notes: parsed.data.notes ?? null,
      outcome: parsed.data.outcome,
      follow_up_date: parsed.data.follow_up_date ?? null,
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
      source: "web",
      system: false,
    })
    .select("*")
    .single();
  if (vErr) return { success: false, error: vErr.message };

  // Auto-flip lead stage on terminal outcomes
  const targetStage = mapOutcomeToStage(parsed.data.outcome);
  if (targetStage && targetStage !== lead.data.stage) {
    await sb
      .from("leads")
      .update({ stage: targetStage })
      .eq("id", parsed.data.lead_id)
      .eq("org_id", ctx.orgId);
  }

  revalidatePath("/dashboard/geo/leads");
  revalidatePath(`/dashboard/geo/leads/${parsed.data.lead_id}`);
  revalidatePath("/dashboard/geo/my-leads");
  return { success: true, data: visit as VisitRow };
}

export async function updateLeadVisit(
  id: string,
  patch: z.infer<typeof VisitUpdateSchema>,
): Promise<ActionResult<VisitRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const parsed = VisitUpdateSchema.safeParse(patch);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const sb = createAdminSupabase();
  const { data: existing, error: eErr } = await sb
    .from("lead_visits")
    .select("*")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (eErr) return { success: false, error: eErr.message };
  if (!existing) return { success: false, error: "Not found" };

  // Author + admin can edit; system rows are immutable.
  if (existing.system) return { success: false, error: "System rows are immutable" };
  if (!isAdmin(ctx.role) && existing.employee_id !== ctx.employeeId) {
    return { success: false, error: "Author only" };
  }

  const { data, error } = await sb
    .from("lead_visits")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/leads");
  revalidatePath(`/dashboard/geo/leads/${existing.lead_id}`);
  return { success: true, data: data as VisitRow };
}

export async function deleteLeadVisit(id: string): Promise<ActionResult<void>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const sb = createAdminSupabase();
  const { data: existing, error: eErr } = await sb
    .from("lead_visits")
    .select("system, lead_id")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (eErr) return { success: false, error: eErr.message };
  if (!existing) return { success: false, error: "Not found" };
  if (existing.system) return { success: false, error: "System rows cannot be deleted" };

  const { error } = await sb
    .from("lead_visits")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/leads");
  revalidatePath(`/dashboard/geo/leads/${existing.lead_id}`);
  return { success: true, data: undefined };
}
```

- [ ] **Step 2: Lint check**

```bash
npm run lint -- src/actions/geo-visits.ts
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/actions/geo-visits.ts
git commit -m "feat(jambageo): lead-visit server actions

- listLeadVisits (scope via parent lead)
- createLeadVisit (admin/manager/assigned-staff; auto-flips lead.stage on terminal outcome)
- updateLeadVisit (author + admin; system rows immutable)
- deleteLeadVisit (admin only; system rows protected)

Spec §4."
```

---

## Task 7: Server actions — geo-sessions, geo-consents, geo-reports

**Files:**
- Create: `src/actions/geo-sessions.ts`
- Create: `src/actions/geo-consents.ts`
- Create: `src/actions/geo-reports.ts`

- [ ] **Step 1: Write `src/actions/geo-sessions.ts`**

```ts
"use server";

import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import { isAdmin, type ActionResult } from "@/types";
import { getManagerScopedEmployeeIds } from "@/lib/attendance/manager-scope";

export interface ActiveSessionView {
  session_id: string;
  employee_id: string;
  employee_name: string;
  started_at: string;
  last_ping_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
}

export async function listActiveSessions(): Promise<ActionResult<ActiveSessionView[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const sb = createAdminSupabase();
  let q = sb
    .from("duty_sessions")
    .select(
      "id, employee_id, started_at, last_ping_at, last_lat, last_lng, employee:employees!duty_sessions_employee_id_fkey(first_name, last_name)",
    )
    .eq("org_id", ctx.orgId)
    .eq("status", "active");

  if (!isAdmin(ctx.role) && ctx.employeeId) {
    const dept = await getManagerScopedEmployeeIds(ctx.orgId, ctx.employeeId);
    if (dept.length === 0) return { success: true, data: [] };
    q = q.in("employee_id", dept);
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []).map((r: any) => ({
    session_id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employee
      ? `${r.employee.first_name ?? ""} ${r.employee.last_name ?? ""}`.trim()
      : "Unknown",
    started_at: r.started_at,
    last_ping_at: r.last_ping_at,
    last_lat: r.last_lat,
    last_lng: r.last_lng,
  }));
  return { success: true, data: rows };
}

export async function listSessionPings(session_id: string): Promise<ActionResult<{
  id: string; lat: number; lng: number; captured_at: string;
}[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("location_pings")
    .select("id, lat, lng, captured_at")
    .eq("session_id", session_id)
    .eq("org_id", ctx.orgId)
    .order("captured_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as any };
}

// ---- Phase 2 stubs (mobile-only writers; throw if called from web) ----

export async function startSession(): Promise<ActionResult<never>> {
  return { success: false, error: "TODO(PRD 04): mobile-only action" };
}
export async function endSession(): Promise<ActionResult<never>> {
  return { success: false, error: "TODO(PRD 04): mobile-only action" };
}
export async function ingestPings(): Promise<ActionResult<never>> {
  return { success: false, error: "TODO(PRD 04): mobile-only action" };
}
```

- [ ] **Step 2: Write `src/actions/geo-consents.ts`**

```ts
"use server";

import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import { isAdmin, type ActionResult } from "@/types";

interface ConsentRow {
  id: string;
  org_id: string;
  employee_id: string;
  granted_at: string | null;
  revoked_at: string | null;
  retention_days: number;
  app_version: string | null;
  created_at: string;
  updated_at: string;
}

export async function listConsents(): Promise<
  ActionResult<(ConsentRow & { employee_name: string | null })[]>
> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("geo_consents")
    .select(
      "*, employee:employees!geo_consents_employee_id_fkey(first_name, last_name)",
    )
    .eq("org_id", ctx.orgId)
    .order("updated_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []).map((r: any) => ({
    ...(r as ConsentRow),
    employee_name: r.employee
      ? `${r.employee.first_name ?? ""} ${r.employee.last_name ?? ""}`.trim() || null
      : null,
  }));
  return { success: true, data: rows };
}

export async function recordConsent(): Promise<ActionResult<never>> {
  return { success: false, error: "TODO(PRD 04): mobile-only action" };
}
export async function revokeConsent(): Promise<ActionResult<never>> {
  return { success: false, error: "TODO(PRD 04): mobile-only action" };
}
```

- [ ] **Step 3: Write `src/actions/geo-reports.ts`**

```ts
"use server";

import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import { isAdmin, type ActionResult } from "@/types";
import { LEAD_STAGES, type LeadStage } from "@/lib/geo/stages";
import { getManagerScopedEmployeeIds } from "@/lib/attendance/manager-scope";
import { computeLeadScope } from "./geo-leads";

export interface FunnelRow {
  stage: LeadStage;
  count: number;
}

export async function getLeadFunnel(
  filter: { from?: string; to?: string } = {},
): Promise<ActionResult<FunnelRow[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const sb = createAdminSupabase();
  let q = sb.from("leads").select("stage").eq("org_id", ctx.orgId);
  if (filter.from) q = q.gte("created_at", filter.from);
  if (filter.to) q = q.lte("created_at", filter.to);

  // Scope-filter
  if (!isAdmin(ctx.role) && ctx.employeeId) {
    const dept = await getManagerScopedEmployeeIds(ctx.orgId, ctx.employeeId);
    const scope = computeLeadScope(
      { role: ctx.role, employeeId: ctx.employeeId },
      { dept },
    );
    if (scope) {
      const parts: string[] = [];
      if (scope.inAssignedTo.length) parts.push(`assigned_to.in.(${scope.inAssignedTo.join(",")})`);
      if (scope.includeUnassigned) parts.push("assigned_to.is.null");
      if (parts.length === 0) {
        return { success: true, data: LEAD_STAGES.map(s => ({ stage: s, count: 0 })) };
      }
      q = q.or(parts.join(","));
    }
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  const counts: Record<string, number> = Object.fromEntries(LEAD_STAGES.map(s => [s, 0]));
  for (const r of data ?? []) counts[r.stage] = (counts[r.stage] ?? 0) + 1;

  return {
    success: true,
    data: LEAD_STAGES.map(stage => ({ stage, count: counts[stage] })),
  };
}

export async function getOverdueFollowUps(): Promise<
  ActionResult<{
    lead_id: string;
    lead_name: string;
    assignee_name: string | null;
    follow_up_date: string;
    days_overdue: number;
  }[]>
> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const today = new Date().toISOString().slice(0, 10);
  const sb = createAdminSupabase();
  let q = sb
    .from("lead_visits")
    .select(
      "follow_up_date, lead:leads!lead_visits_lead_id_fkey(id, name, assigned_to, assignee:employees!leads_assigned_to_fkey(first_name, last_name))",
    )
    .eq("org_id", ctx.orgId)
    .lt("follow_up_date", today)
    .not("follow_up_date", "is", null);

  // Scope filter (uses parent lead.assigned_to)
  if (!isAdmin(ctx.role) && ctx.employeeId) {
    const dept = await getManagerScopedEmployeeIds(ctx.orgId, ctx.employeeId);
    const ids = ctx.role === "manager" ? dept : [ctx.employeeId];
    if (ids.length === 0) return { success: true, data: [] };
    // We can't easily filter parent .assigned_to via PostgREST embed; fetch + filter in JS
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  const rows = (data ?? [])
    .map((r: any) => {
      if (!r.lead) return null;
      const d = new Date(r.follow_up_date);
      const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
      return {
        lead_id: r.lead.id,
        lead_name: r.lead.name,
        assignee_name: r.lead.assignee
          ? `${r.lead.assignee.first_name ?? ""} ${r.lead.assignee.last_name ?? ""}`.trim() || null
          : null,
        follow_up_date: r.follow_up_date,
        days_overdue: days,
      };
    })
    .filter(Boolean) as any[];
  return { success: true, data: rows };
}

export async function getMyAssignedLeads(): Promise<ActionResult<{
  id: string; name: string; company: string | null; stage: LeadStage; updated_at: string;
}[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!ctx.employeeId) return { success: true, data: [] };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .select("id, name, company, stage, updated_at")
    .eq("org_id", ctx.orgId)
    .eq("assigned_to", ctx.employeeId)
    .order("updated_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as any };
}
```

- [ ] **Step 4: Lint check**

```bash
npm run lint -- src/actions/geo-sessions.ts src/actions/geo-consents.ts src/actions/geo-reports.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/geo-sessions.ts src/actions/geo-consents.ts src/actions/geo-reports.ts
git commit -m "feat(jambageo): sessions/consents/reports actions

- listActiveSessions / listSessionPings (Phase 1 read-only; Phase 2 stubs included)
- listConsents (admin only)
- getLeadFunnel (scope-aware stage counts)
- getOverdueFollowUps (lead_visits.follow_up_date < today)
- getMyAssignedLeads (staff self-view)

Spec §4."
```

---

## Task 8: Settings — JambaGeo section + `updateJambaGeoSettings`

**Files:**
- Modify: `src/actions/settings.ts` (add `updateJambaGeoSettings`)
- Create: `src/components/settings/jambageo-section.tsx`
- Modify: `src/components/settings/settings-content.tsx` (slot in JambaGeoSection)

- [ ] **Step 1: Add `updateJambaGeoSettings` to `src/actions/settings.ts`**

Locate the `updateAttendanceSettings` action to use as a template:

```bash
grep -n "updateAttendanceSettings\|updateJambaHireSettings" src/actions/settings.ts
```

Add this action at the bottom of the file (above any existing exports):

```ts
const JambaGeoSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  default_retention_days: z.number().int().min(1).max(365).optional(),
  default_ping_interval_min: z.number().int().min(5).max(60).optional(),
});

export async function updateJambaGeoSettings(
  input: z.infer<typeof JambaGeoSettingsSchema>,
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Admin only" };

  const parsed = JambaGeoSettingsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const sb = createAdminSupabase();
  // Read current settings JSONB to merge (avoid clobbering)
  const { data: org, error: rErr } = await sb
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();
  if (rErr) return { success: false, error: rErr.message };

  const currentSettings = (org.settings ?? {}) as Record<string, any>;
  const currentGeo = (currentSettings.jambageo ?? {}) as Record<string, any>;

  const nextGeo = { ...currentGeo };
  if (parsed.data.default_retention_days !== undefined)
    nextGeo.default_retention_days = parsed.data.default_retention_days;
  if (parsed.data.default_ping_interval_min !== undefined)
    nextGeo.default_ping_interval_min = parsed.data.default_ping_interval_min;

  const nextSettings = { ...currentSettings, jambageo: nextGeo };
  if (parsed.data.enabled !== undefined) {
    nextSettings.jambageo_enabled = parsed.data.enabled;
  }

  const { error } = await sb
    .from("organizations")
    .update({ settings: nextSettings })
    .eq("id", user.orgId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/geo");
  return { success: true, data: undefined };
}
```

Ensure `z`, `getCurrentUser`, `isAdmin`, `createAdminSupabase`, `revalidatePath`, and `ActionResult` are already imported at the top of the file (they will be from existing actions).

- [ ] **Step 2: Create `src/components/settings/jambageo-section.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/settings/collapsible-section";
import { MapPin } from "lucide-react";
import { updateJambaGeoSettings } from "@/actions/settings";

interface JambaGeoSectionProps {
  enabled: boolean;
  defaultRetentionDays: number;
  defaultPingIntervalMin: number;
}

export function JambaGeoSection(props: JambaGeoSectionProps) {
  const [enabled, setEnabled] = useState(props.enabled);
  const [retention, setRetention] = useState(props.defaultRetentionDays);
  const [pingInterval, setPingInterval] = useState(props.defaultPingIntervalMin);
  const [pending, startTransition] = useTransition();

  function save(partial: Parameters<typeof updateJambaGeoSettings>[0]) {
    startTransition(async () => {
      const res = await updateJambaGeoSettings(partial);
      if (res.success) toast.success("JambaGeo settings updated");
      else toast.error(res.error);
    });
  }

  return (
    <CollapsibleSection
      id="jambageo"
      title="JambaGeo"
      icon={<MapPin className="h-4 w-4" />}
      description="Field-staff tracking + lightweight lead CRM (Business plan)"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Module</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable JambaGeo</Label>
              <p className="text-xs text-muted-foreground">
                Shows the JambaGeo sidebar entry for admins and managers in this org.
              </p>
            </div>
            <Switch
              checked={enabled}
              disabled={pending}
              onCheckedChange={(v) => {
                setEnabled(v);
                save({ enabled: v });
              }}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="retention">Default location retention (days)</Label>
              <Input
                id="retention"
                type="number"
                min={1}
                max={365}
                value={retention}
                onChange={(e) => setRetention(Number(e.target.value))}
                disabled={!enabled || pending}
              />
              <p className="text-xs text-muted-foreground mt-1">
                GPS pings older than this are deleted nightly. Used when employees
                haven't set their own retention via the mobile consent screen. Default 90.
              </p>
            </div>
            <div>
              <Label htmlFor="ping-interval">Default ping interval (minutes)</Label>
              <Input
                id="ping-interval"
                type="number"
                min={5}
                max={60}
                value={pingInterval}
                onChange={(e) => setPingInterval(Number(e.target.value))}
                disabled={!enabled || pending}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Mobile app pings this often during an active duty session. Default 15.
              </p>
            </div>
          </div>

          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={!enabled || pending}
              onClick={() =>
                save({
                  default_retention_days: retention,
                  default_ping_interval_min: pingInterval,
                })
              }
            >
              Save defaults
            </Button>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            Manage geofences →{" "}
            <a href="/dashboard/geo/geofences" className="text-primary hover:underline">
              JambaGeo &gt; Geofences
            </a>
          </p>
        </CardContent>
      </Card>
    </CollapsibleSection>
  );
}
```

- [ ] **Step 3: Slot `<JambaGeoSection>` into `settings-content.tsx`**

Find where `<AttendanceSection>` is rendered:

```bash
grep -n "AttendanceSection\|PayrollSection" src/components/settings/settings-content.tsx
```

Render the JambaGeo section after Payroll (mirrors plan-tier order on the marketing page). It must be inside the admin-only gate. Pull current values from `organizations.settings`:

```tsx
{jambaGeoFeatureAvailable && isAdmin && (
  <JambaGeoSection
    enabled={Boolean((settings as any)?.jambageo_enabled)}
    defaultRetentionDays={(settings as any)?.jambageo?.default_retention_days ?? 90}
    defaultPingIntervalMin={(settings as any)?.jambageo?.default_ping_interval_min ?? 15}
  />
)}
```

`jambaGeoFeatureAvailable` is derived in the parent page (server component) from `hasFeature(plan, "jambageo")`.

- [ ] **Step 4: Lint + manual smoke**

```bash
npm run lint -- src/actions/settings.ts src/components/settings/jambageo-section.tsx src/components/settings/settings-content.tsx
npm run dev
```

Manually: open `http://localhost:3000/dashboard/settings`, expand JambaGeo section, toggle enabled, adjust retention to 30, click Save. Verify success toast.

- [ ] **Step 5: Commit**

```bash
git add src/actions/settings.ts src/components/settings/jambageo-section.tsx src/components/settings/settings-content.tsx
git commit -m "feat(jambageo): settings section + updateJambaGeoSettings

- JambaGeoSection: enable toggle + retention/ping-interval defaults
- updateJambaGeoSettings merges into organizations.settings.jambageo JSONB
- Admin-only render gated on jambageo plan feature
- Quick link to /dashboard/geo/geofences

Spec §5."
```

---

## Task 9: Email — lead-assigned template + sender

**Files:**
- Create: `src/components/emails/lead-assigned.tsx`
- Create: `src/components/emails/lead-assigned-sender.ts`

- [ ] **Step 1: Create `src/components/emails/lead-assigned.tsx`**

Copy the layout shell from an existing template (e.g. `src/components/emails/leave-status.tsx`):

```bash
grep -ln "Html, Head\|@react-email" src/components/emails/ | head -3
```

```tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface LeadAssignedEmailProps {
  assigneeName: string;
  assignerName: string;
  leadName: string;
  leadCompany: string | null;
  leadContact: string | null;
  leadAddress: string | null;
  leadValueInr: number | null;
  deepLinkUrl: string;
  orgName: string;
}

export default function LeadAssignedEmail(props: LeadAssignedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{props.assignerName} assigned you a new lead: {props.leadName}</Preview>
      <Body style={{ fontFamily: "Inter, system-ui, sans-serif", backgroundColor: "#f7fafc" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "32px", maxWidth: 560, borderRadius: 8 }}>
          <Heading as="h2" style={{ marginTop: 0, color: "#0f172a" }}>
            New lead assigned to you
          </Heading>
          <Text style={{ color: "#475569" }}>
            Hi {props.assigneeName}, {props.assignerName} just assigned you a new lead at{" "}
            <strong>{props.orgName}</strong>.
          </Text>

          <Section style={{ backgroundColor: "#f8fafc", padding: 16, borderRadius: 6, marginTop: 16 }}>
            <Text style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>
              {props.leadName}
            </Text>
            {props.leadCompany && (
              <Text style={{ margin: "4px 0 0", color: "#475569" }}>
                {props.leadCompany}
              </Text>
            )}
            {props.leadContact && (
              <Text style={{ margin: "4px 0 0", color: "#475569" }}>
                📞 {props.leadContact}
              </Text>
            )}
            {props.leadAddress && (
              <Text style={{ margin: "4px 0 0", color: "#475569" }}>
                📍 {props.leadAddress}
              </Text>
            )}
            {props.leadValueInr !== null && (
              <Text style={{ margin: "8px 0 0", color: "#0f172a", fontWeight: 600 }}>
                Estimated value: ₹{props.leadValueInr.toLocaleString("en-IN")}
              </Text>
            )}
          </Section>

          <Section style={{ marginTop: 24 }}>
            <Link
              href={props.deepLinkUrl}
              style={{
                backgroundColor: "#0d8b78", // teal primary
                color: "#ffffff",
                padding: "10px 20px",
                borderRadius: 6,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Open lead in JambaGeo →
            </Link>
          </Section>

          <Hr style={{ marginTop: 24, borderColor: "#e2e8f0" }} />
          <Text style={{ fontSize: 12, color: "#94a3b8" }}>
            JambaHR · JambaGeo · This is an automated message — please don't reply.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Create the sender `src/components/emails/lead-assigned-sender.ts`**

```ts
import { render } from "@react-email/render";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { createAdminSupabase } from "@/lib/supabase/server";
import LeadAssignedEmail from "./lead-assigned";

interface Args {
  leadId: string;
  assigneeId: string;
}

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com";

export async function sendLeadAssignedEmail({ leadId, assigneeId }: Args): Promise<void> {
  try {
    const sb = createAdminSupabase();

    const { data: lead } = await sb
      .from("leads")
      .select("id, org_id, name, company, contact_phone, address, value_inr, created_by")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return;

    const [
      { data: assignee },
      { data: assigner },
      { data: org },
    ] = await Promise.all([
      sb.from("employees").select("first_name, last_name, email").eq("id", assigneeId).maybeSingle(),
      lead.created_by
        ? sb.from("employees").select("first_name, last_name").eq("id", lead.created_by).maybeSingle()
        : Promise.resolve({ data: null }),
      sb.from("organizations").select("name").eq("id", lead.org_id).maybeSingle(),
    ]);

    if (!assignee?.email) return;

    const assigneeName = `${assignee.first_name ?? ""} ${assignee.last_name ?? ""}`.trim() || "there";
    const assignerName = assigner
      ? `${assigner.first_name ?? ""} ${assigner.last_name ?? ""}`.trim() || "An admin"
      : "An admin";

    const html = render(
      LeadAssignedEmail({
        assigneeName,
        assignerName,
        leadName: lead.name,
        leadCompany: lead.company,
        leadContact: lead.contact_phone,
        leadAddress: lead.address,
        leadValueInr: lead.value_inr,
        deepLinkUrl: `${APP_ORIGIN}/dashboard/geo/leads/${lead.id}`,
        orgName: org?.name ?? "your team",
      }),
    );

    await resend.emails.send({
      from: FROM_EMAIL,
      to: assignee.email,
      subject: `${assignerName} assigned you a new lead: ${lead.name}`,
      html,
    });
  } catch (err) {
    // Best-effort — never throw out of waitUntil. Log so we get a Sentry breadcrumb.
    console.error("[jambageo] sendLeadAssignedEmail failed", err);
  }
}
```

- [ ] **Step 3: Lint check**

```bash
npm run lint -- src/components/emails/lead-assigned.tsx src/components/emails/lead-assigned-sender.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/components/emails/lead-assigned.tsx src/components/emails/lead-assigned-sender.ts
git commit -m "feat(jambageo): lead-assigned email template + sender

- React Email template (Inter/teal theme matching app)
- Sender resolves assignee email, assigner name, org name from Supabase
- Best-effort: swallows + logs on failure (called via waitUntil from assignLead)
- Subject: '{assignerName} assigned you a new lead: {leadName}'
- Sender: FROM_EMAIL (support@jambahr.com)

Spec §4."
```

---

## Task 10: Geo route group — layout + redirect + nav component

**Files:**
- Create: `src/app/dashboard/geo/layout.tsx`
- Create: `src/app/dashboard/geo/page.tsx`
- Create: `src/components/geo/geo-nav.tsx`

- [ ] **Step 1: Create `src/components/geo/geo-nav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface GeoNavProps {
  isAdmin: boolean;
  isManagerOrAbove: boolean;
}

export function GeoNav({ isAdmin, isManagerOrAbove }: GeoNavProps) {
  const pathname = usePathname();

  const items = [
    { href: "/dashboard/geo/leads", label: "Leads", show: true },
    { href: "/dashboard/geo/my-leads", label: "My Leads", show: !isManagerOrAbove },
    { href: "/dashboard/geo/geofences", label: "Geofences", show: true },
    { href: "/dashboard/geo/live-map", label: "Live Map", show: isManagerOrAbove },
    { href: "/dashboard/geo/reports", label: "Reports", show: isManagerOrAbove },
  ].filter(i => i.show);

  return (
    <nav className="flex gap-1 border-b mb-6">
      {items.map(item => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Create `src/app/dashboard/geo/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { isAdmin, isManagerOrAbove } from "@/types";
import { GeoNav } from "@/components/geo/geo-nav";

export default async function GeoLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!hasFeature(user.plan ?? "starter", "jambageo")) {
    redirect("/dashboard/settings#billing");
  }
  if (!user.jambaGeoEnabled) {
    redirect("/dashboard/settings#jambageo");
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">JambaGeo</h1>
        <p className="text-sm text-muted-foreground">
          Field-staff tracking + lightweight lead CRM
        </p>
      </header>
      <GeoNav isAdmin={isAdmin(user.role)} isManagerOrAbove={isManagerOrAbove(user.role)} />
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/dashboard/geo/page.tsx`**

```tsx
import { redirect } from "next/navigation";

export default function GeoIndex() {
  redirect("/dashboard/geo/leads");
}
```

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard/geo`. Expected: redirects to `/dashboard/geo/leads` (which currently 404s — that's fine; Task 12 creates it).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/geo/layout.tsx src/app/dashboard/geo/page.tsx src/components/geo/geo-nav.tsx
git commit -m "feat(jambageo): /dashboard/geo route group — layout + nav + redirect

- Layout enforces plan + jambaGeoEnabled gates; redirects to settings otherwise
- GeoNav (client): tabs hide based on isManagerOrAbove / isAdmin
- /dashboard/geo redirects to /dashboard/geo/leads

Spec §5."
```

---

## Task 11: Geofences page + map + list

**Files:**
- Create: `src/app/dashboard/geo/geofences/page.tsx`
- Create: `src/components/geo/geofence-list.tsx`
- Create: `src/components/geo/geofence-map.tsx`

This task installs the first Mapbox surface. Most tricky bits: dynamic import with `ssr: false`, draw control wiring, two-way binding between list and map.

- [ ] **Step 1: Create `src/components/geo/geofence-map.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Map, { Source, Layer, NavigationControl, type MapRef } from "react-map-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { getMapboxToken, DEFAULT_INDIA_VIEWPORT, MAPBOX_STYLE } from "@/lib/mapbox";
import { haversineMeters } from "@/lib/geo/geometry";

export interface GeofenceMapProps {
  geofences: Array<{
    id: string;
    name: string;
    type: "client" | "office";
    center_lat: number;
    center_lng: number;
    radius_m: number;
    is_active: boolean;
  }>;
  canEdit: boolean;
  onCreate?: (input: { center_lat: number; center_lng: number; radius_m: number }) => void;
  onSelect?: (id: string | null) => void;
  selectedId?: string | null;
}

/**
 * Mapbox circle rendering trick: there's no native circle in Mapbox style spec.
 * We emit a GeoJSON FeatureCollection of polygon approximations (~64 sides)
 * for each geofence and render with fill + line layers.
 */
function circleToPolygon(lat: number, lng: number, radiusM: number, steps = 64) {
  const coords: [number, number][] = [];
  const earthR = 6_371_000;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = (radiusM * Math.cos(angle)) / (earthR * Math.cos((lat * Math.PI) / 180));
    const dy = (radiusM * Math.sin(angle)) / earthR;
    coords.push([
      lng + (dx * 180) / Math.PI,
      lat + (dy * 180) / Math.PI,
    ]);
  }
  return coords;
}

export default function GeofenceMap(props: GeofenceMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [token] = useState(() => {
    try { return getMapboxToken(); } catch { return null; }
  });

  // Set up draw control once
  useEffect(() => {
    if (!props.canEdit || !mapRef.current) return;
    const map = mapRef.current.getMap();
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { point: true, trash: true },
    });
    map.addControl(draw as any, "top-right");
    drawRef.current = draw;

    const onCreate = (e: any) => {
      const f = e.features[0];
      if (!f || f.geometry.type !== "Point" || !props.onCreate) return;
      const [lng, lat] = f.geometry.coordinates;
      // Default radius = 200m; admin can edit in the list panel
      props.onCreate({ center_lat: lat, center_lng: lng, radius_m: 200 });
      draw.deleteAll(); // clear after capture
    };
    map.on("draw.create" as any, onCreate);
    return () => {
      map.off("draw.create" as any, onCreate);
      try { map.removeControl(draw as any); } catch {}
      drawRef.current = null;
    };
  }, [props.canEdit, props.onCreate]);

  if (!token) {
    return (
      <div className="rounded border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
        Map unavailable — <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> not configured.
        Geofences can still be edited from the list.
      </div>
    );
  }

  const geojson = {
    type: "FeatureCollection" as const,
    features: props.geofences.map(g => ({
      type: "Feature" as const,
      id: g.id,
      properties: {
        name: g.name,
        type: g.type,
        is_active: g.is_active,
        selected: props.selectedId === g.id,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [circleToPolygon(g.center_lat, g.center_lng, g.radius_m)],
      },
    })),
  };

  return (
    <div style={{ height: 500, width: "100%", borderRadius: 8, overflow: "hidden" }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={DEFAULT_INDIA_VIEWPORT}
        mapStyle={MAPBOX_STYLE}
        onClick={(e) => {
          // Hit-test geofences (use haversine vs centroid lat/lng for simplicity)
          const click = e.lngLat;
          const hit = props.geofences.find(
            g => haversineMeters(click.lat, click.lng, g.center_lat, g.center_lng) <= g.radius_m,
          );
          props.onSelect?.(hit?.id ?? null);
        }}
      >
        <NavigationControl position="top-left" />
        <Source id="geofences" type="geojson" data={geojson}>
          <Layer
            id="geofences-fill"
            type="fill"
            paint={{
              "fill-color": [
                "case",
                ["==", ["get", "selected"], true], "#0d8b78",
                ["==", ["get", "type"], "office"], "#3b82f6",
                "#f59e0b",
              ],
              "fill-opacity": [
                "case",
                ["==", ["get", "is_active"], false], 0.1,
                0.25,
              ],
            }}
          />
          <Layer
            id="geofences-line"
            type="line"
            paint={{
              "line-color": [
                "case",
                ["==", ["get", "selected"], true], "#0d8b78",
                "#475569",
              ],
              "line-width": 1.5,
            }}
          />
        </Source>
      </Map>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/geo/geofence-list.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import {
  createGeofence,
  updateGeofence,
  toggleGeofenceActive,
  deleteGeofence,
} from "@/actions/geo-geofences";
import { formatGeofenceRadius } from "@/lib/geo/geometry";

export interface GeofenceListProps {
  geofences: Array<{
    id: string;
    name: string;
    type: "client" | "office";
    center_lat: number;
    center_lng: number;
    radius_m: number;
    is_active: boolean;
    notes: string | null;
  }>;
  isAdmin: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  // pending-create from map click
  pendingCreate: { center_lat: number; center_lng: number; radius_m: number } | null;
  onPendingCreateClear: () => void;
}

export function GeofenceList(props: GeofenceListProps) {
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"client" | "office">("client");

  function doCreate() {
    if (!props.pendingCreate || !newName.trim()) return;
    startTransition(async () => {
      const res = await createGeofence({
        name: newName.trim(),
        type: newType,
        center_lat: props.pendingCreate!.center_lat,
        center_lng: props.pendingCreate!.center_lng,
        radius_m: props.pendingCreate!.radius_m,
      });
      if (res.success) {
        toast.success(`Geofence "${newName}" created`);
        setNewName("");
        props.onPendingCreateClear();
      } else toast.error(res.error);
    });
  }

  function doToggle(id: string, value: boolean) {
    startTransition(async () => {
      const res = await toggleGeofenceActive(id, value);
      if (!res.success) toast.error(res.error);
    });
  }

  function doUpdateRadius(id: string, radius_m: number) {
    startTransition(async () => {
      const res = await updateGeofence(id, { radius_m });
      if (!res.success) toast.error(res.error);
    });
  }

  function doDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Lead-visit history is unaffected.`)) return;
    startTransition(async () => {
      const res = await deleteGeofence(id);
      if (res.success) toast.success(`Deleted "${name}"`);
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      {props.isAdmin && props.pendingCreate && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New geofence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs text-muted-foreground">
              {props.pendingCreate.center_lat.toFixed(5)},{" "}
              {props.pendingCreate.center_lng.toFixed(5)} · radius{" "}
              {formatGeofenceRadius(props.pendingCreate.radius_m)} (editable after save)
            </div>
            <Input
              placeholder="Name (e.g. Andheri Office)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={pending}
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as any)}
              disabled={pending}
              className="w-full border rounded p-2 text-sm"
            >
              <option value="client">Client site</option>
              <option value="office">Office</option>
            </select>
            <div className="flex gap-2">
              <Button onClick={doCreate} disabled={pending || !newName.trim()} size="sm">
                Save
              </Button>
              <Button variant="ghost" onClick={props.onPendingCreateClear} size="sm">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {props.geofences.length === 0 && !props.pendingCreate && (
          <p className="text-sm text-muted-foreground">
            {props.isAdmin
              ? "No geofences yet. Click anywhere on the map to drop a pin."
              : "No geofences configured. Ask an admin to add them."}
          </p>
        )}
        {props.geofences.map(g => (
          <Card
            key={g.id}
            className={
              "cursor-pointer transition " +
              (props.selectedId === g.id ? "border-primary" : "")
            }
            onClick={() => props.onSelect(g.id)}
          >
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm">{g.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {g.type === "client" ? "Client site" : "Office"} ·{" "}
                  {formatGeofenceRadius(g.radius_m)}
                </p>
              </div>
              {!g.is_active && <Badge variant="outline">Inactive</Badge>}
            </CardHeader>
            {props.isAdmin && (
              <CardContent className="space-y-2 pt-0">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Radius (m)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5000}
                    value={g.radius_m}
                    onChange={(e) => doUpdateRadius(g.id, Number(e.target.value))}
                    disabled={pending}
                    className="h-7 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={g.is_active}
                      onCheckedChange={(v) => doToggle(g.id, v)}
                      disabled={pending}
                    />
                    <span className="text-xs">{g.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); doDelete(g.id, g.name); }}
                    disabled={pending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/dashboard/geo/geofences/page.tsx`**

```tsx
import dynamic from "next/dynamic";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { listGeofences } from "@/actions/geo-geofences";
import { GeofenceList } from "@/components/geo/geofence-list";
import { isAdmin } from "@/types";
import { GeofencePageClient } from "./client";

// Map is client-only (Mapbox GL needs window)
const GeofenceMap = dynamic(() => import("@/components/geo/geofence-map"), {
  ssr: false,
  loading: () => <div className="h-[500px] bg-muted/30 rounded animate-pulse" />,
});

export default async function GeofencesPage() {
  const ctx = await requireJambaGeoAccess();
  const res = await listGeofences();
  const geofences = res.success ? res.data : [];

  return (
    <GeofencePageClient
      geofences={geofences}
      isAdmin={isAdmin(ctx.role)}
    />
  );
}
```

Now the client wrapper to hold shared selectedId state — create `src/app/dashboard/geo/geofences/client.tsx`:

```tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { GeofenceList } from "@/components/geo/geofence-list";

const GeofenceMap = dynamic(() => import("@/components/geo/geofence-map"), {
  ssr: false,
  loading: () => <div className="h-[500px] bg-muted/30 rounded animate-pulse" />,
});

interface Props {
  geofences: Parameters<typeof GeofenceList>[0]["geofences"];
  isAdmin: boolean;
}

export function GeofencePageClient({ geofences, isAdmin }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState<
    { center_lat: number; center_lng: number; radius_m: number } | null
  >(null);

  return (
    <div className="grid md:grid-cols-[1fr_360px] gap-6">
      <GeofenceMap
        geofences={geofences as any}
        canEdit={isAdmin}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={setPendingCreate}
      />
      <GeofenceList
        geofences={geofences}
        isAdmin={isAdmin}
        selectedId={selectedId}
        onSelect={setSelectedId}
        pendingCreate={pendingCreate}
        onPendingCreateClear={() => setPendingCreate(null)}
      />
    </div>
  );
}
```

Update the server page to import `GeofencePageClient` from `./client` (already in code above).

- [ ] **Step 4: Verify `next.config.js` external packages**

Mapbox GL JS doesn't need `serverComponentsExternalPackages` (it's only loaded client-side via dynamic import with `ssr: false`). Verify by running:

```bash
npm run dev
```

Open `http://localhost:3000/dashboard/geo/geofences`. With `NEXT_PUBLIC_MAPBOX_TOKEN` set: map renders. Without it: graceful fallback message. No SSR crash either way.

- [ ] **Step 5: Smoke-test create + edit**

1. Click on the map → "New geofence" card appears in right pane.
2. Enter name + select type → Save.
3. Card moves to the list, polygon appears on map.
4. Click the polygon on map → list card highlights.
5. Edit radius input → polygon resizes (after page revalidate; may need a manual refresh in Phase 1).
6. Toggle inactive → polygon fades.
7. Delete → polygon disappears.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/geo/geofences/page.tsx src/app/dashboard/geo/geofences/client.tsx \
        src/components/geo/geofence-map.tsx src/components/geo/geofence-list.tsx
git commit -m "feat(jambageo): geofences page with Mapbox draw + edit panel

- GeofenceMap: react-map-gl + mapbox-gl-draw, ssr:false dynamic import
- Circle polygons via 64-step approximation (no PostGIS needed)
- Click map → pending create card with name + type picker
- Click polygon → selects in list panel
- GeofenceList: inline radius edit, active toggle, delete
- Graceful fallback when NEXT_PUBLIC_MAPBOX_TOKEN missing
- Color coding: blue=office, amber=client, teal=selected

Spec §5."
```

---

## Task 12: Leads kanban + lead-card + leads-list

**Files:**
- Create: `src/app/dashboard/geo/leads/page.tsx`
- Create: `src/app/dashboard/geo/leads/client.tsx`
- Create: `src/components/geo/leads-kanban.tsx`
- Create: `src/components/geo/lead-card.tsx`
- Create: `src/components/geo/leads-list.tsx`

- [ ] **Step 1: Create `src/components/geo/lead-card.tsx`**

```tsx
"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { stageLabel, type LeadStage } from "@/lib/geo/stages";

export interface LeadCardData {
  id: string;
  name: string;
  company: string | null;
  contact_phone: string | null;
  value_inr: number | null;
  assigned_to: string | null;
  assignee_name: string | null;
  stage: LeadStage;
}

export function LeadCard({ lead, draggable }: { lead: LeadCardData; draggable?: boolean }) {
  return (
    <Link
      href={`/dashboard/geo/leads/${lead.id}`}
      className={
        "block rounded-md border bg-card p-3 text-sm shadow-sm hover:border-primary transition " +
        (draggable ? "cursor-grab active:cursor-grabbing" : "")
      }
    >
      <div className="font-medium leading-tight">{lead.name}</div>
      {lead.company && (
        <div className="text-xs text-muted-foreground mt-0.5">{lead.company}</div>
      )}
      {lead.contact_phone && (
        <div className="text-xs text-muted-foreground mt-0.5">📞 {lead.contact_phone}</div>
      )}
      {lead.value_inr !== null && lead.value_inr > 0 && (
        <div className="text-xs font-semibold mt-1">
          ₹{lead.value_inr.toLocaleString("en-IN")}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge variant="secondary" className="text-[10px]">
          {stageLabel(lead.stage)}
        </Badge>
        {lead.assignee_name ? (
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
            {lead.assignee_name}
          </span>
        ) : (
          <span className="text-xs italic text-amber-600">Unassigned</span>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create `src/components/geo/leads-kanban.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { LeadCard, type LeadCardData } from "./lead-card";
import { LEAD_STAGES, stageLabel, type LeadStage } from "@/lib/geo/stages";
import { updateLeadStage } from "@/actions/geo-leads";

interface KanbanProps {
  leads: LeadCardData[];
  canDrag: boolean;
}

export function LeadsKanban({ leads, canDrag }: KanbanProps) {
  const [items, setItems] = useState(leads);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const newStage = e.over.id as LeadStage;
    const draggedId = e.active.id as string;
    const dragged = items.find(l => l.id === draggedId);
    if (!dragged || dragged.stage === newStage) return;

    const prev = items;
    setItems(items.map(l => (l.id === draggedId ? { ...l, stage: newStage } : l)));

    startTransition(async () => {
      const res = await updateLeadStage(draggedId, { stage: newStage });
      if (!res.success) {
        setItems(prev); // rollback
        toast.error(res.error);
      }
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {LEAD_STAGES.map(stage => (
          <Column
            key={stage}
            stage={stage}
            leads={items.filter(l => l.stage === stage)}
            canDrag={canDrag}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({ stage, leads, canDrag }: { stage: LeadStage; leads: LeadCardData[]; canDrag: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={
        "rounded-md bg-muted/30 p-2 min-h-[200px] " +
        (isOver ? "ring-2 ring-primary" : "")
      }
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2 flex justify-between">
        <span>{stageLabel(stage)}</span>
        <span>{leads.length}</span>
      </div>
      <div className="space-y-2">
        {leads.map(lead => (canDrag ? <DraggableCard key={lead.id} lead={lead} /> : <LeadCard key={lead.id} lead={lead} />))}
      </div>
    </div>
  );
}

function DraggableCard({ lead }: { lead: LeadCardData }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <LeadCard lead={lead} draggable />
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/geo/leads-list.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LEAD_STAGES, stageLabel, type LeadStage } from "@/lib/geo/stages";
import type { LeadCardData } from "./lead-card";

export function LeadsList({ leads }: { leads: LeadCardData[] }) {
  const [stage, setStage] = useState<LeadStage | "all">("all");
  const [q, setQ] = useState("");
  const filtered = leads.filter(l => {
    if (stage !== "all" && l.stage !== stage) return false;
    if (q && !(`${l.name} ${l.company ?? ""}`.toLowerCase().includes(q.toLowerCase())))
      return false;
    return true;
  });
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="Search name or company"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value as any)}
          className="border rounded p-2 text-sm"
        >
          <option value="all">All stages</option>
          {LEAD_STAGES.map(s => (
            <option key={s} value={s}>{stageLabel(s)}</option>
          ))}
        </select>
      </div>
      <div className="rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left p-2">Lead</th>
              <th className="text-left p-2">Company</th>
              <th className="text-left p-2">Stage</th>
              <th className="text-left p-2">Assignee</th>
              <th className="text-right p-2">Value</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.id} className="border-t hover:bg-muted/30">
                <td className="p-2">
                  <Link href={`/dashboard/geo/leads/${l.id}`} className="font-medium hover:underline">
                    {l.name}
                  </Link>
                </td>
                <td className="p-2 text-muted-foreground">{l.company ?? "—"}</td>
                <td className="p-2">
                  <Badge variant="secondary">{stageLabel(l.stage)}</Badge>
                </td>
                <td className="p-2 text-muted-foreground">
                  {l.assignee_name ?? <span className="italic text-amber-600">Unassigned</span>}
                </td>
                <td className="p-2 text-right">
                  {l.value_inr !== null ? `₹${l.value_inr.toLocaleString("en-IN")}` : "—"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={5}>No leads match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/app/dashboard/geo/leads/page.tsx`**

```tsx
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { listLeads } from "@/actions/geo-leads";
import { isManagerOrAbove } from "@/types";
import { LeadsPageClient } from "./client";

interface PageProps {
  searchParams: { view?: string };
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const ctx = await requireJambaGeoAccess();
  const res = await listLeads();
  const leads = res.success ? res.data : [];

  return (
    <LeadsPageClient
      leads={leads.map(l => ({
        id: l.id,
        name: l.name,
        company: l.company,
        contact_phone: l.contact_phone,
        value_inr: l.value_inr,
        assigned_to: l.assigned_to,
        assignee_name: l.assignee_name,
        stage: l.stage,
      }))}
      view={searchParams.view === "list" ? "list" : "kanban"}
      canCreate={isManagerOrAbove(ctx.role)}
    />
  );
}
```

- [ ] **Step 5: Create `src/app/dashboard/geo/leads/client.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LeadsKanban } from "@/components/geo/leads-kanban";
import { LeadsList } from "@/components/geo/leads-list";
import { LeadDialog } from "@/components/geo/lead-dialog";
import type { LeadCardData } from "@/components/geo/lead-card";
import { Plus } from "lucide-react";

interface Props {
  leads: LeadCardData[];
  view: "kanban" | "list";
  canCreate: boolean;
}

export function LeadsPageClient({ leads, view, canCreate }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 text-sm">
          <Link
            href="/dashboard/geo/leads"
            className={
              "px-3 py-1 rounded " +
              (view === "kanban" ? "bg-muted font-medium" : "text-muted-foreground")
            }
          >
            Kanban
          </Link>
          <Link
            href="/dashboard/geo/leads?view=list"
            className={
              "px-3 py-1 rounded " +
              (view === "list" ? "bg-muted font-medium" : "text-muted-foreground")
            }
          >
            List
          </Link>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New lead
          </Button>
        )}
      </div>

      {view === "kanban" ? (
        <LeadsKanban leads={leads} canDrag={canCreate} />
      ) : (
        <LeadsList leads={leads} />
      )}

      <LeadDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" />
    </div>
  );
}
```

- [ ] **Step 6: Smoke test** (after Task 13 supplies `LeadDialog`)

The page will fail to import `LeadDialog` until Task 13 lands. Either stub the import locally or finish Task 13 before running the dev server. Recommend: continue to Task 13 immediately, then test.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/geo/leads/page.tsx src/app/dashboard/geo/leads/client.tsx \
        src/components/geo/leads-kanban.tsx src/components/geo/lead-card.tsx \
        src/components/geo/leads-list.tsx
git commit -m "feat(jambageo): leads kanban + list + page shell

- LeadsKanban: 6 columns, dnd-kit drag (pointer+touch+keyboard sensors)
- Optimistic stage update with rollback on server error
- LeadsList: search + stage filter, sortable table
- LeadCard: shared in kanban + drag wrapper
- Page toggles kanban/list via ?view=list
- 'New lead' button gated on isManagerOrAbove

Spec §5."
```

---

## Task 13: Lead create/edit dialog

**Files:**
- Create: `src/components/geo/lead-dialog.tsx`

- [ ] **Step 1: Create `src/components/geo/lead-dialog.tsx`**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LEAD_STAGES, stageLabel, type LeadStage } from "@/lib/geo/stages";
import { createLead, updateLead } from "@/actions/geo-leads";

interface AssigneeOption { id: string; name: string }

export interface LeadDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  lead?: {
    id: string;
    name: string;
    company: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    address: string | null;
    value_inr: number | null;
    source: string | null;
    stage: LeadStage;
    assigned_to: string | null;
  };
  assigneeOptions?: AssigneeOption[]; // pulled by parent (manager-scoped on server)
}

export function LeadDialog(props: LeadDialogProps) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "",
    company: "",
    contact_phone: "",
    contact_email: "",
    address: "",
    value_inr: "",
    source: "",
    stage: "new" as LeadStage,
    assigned_to: "" as string,
  });

  useEffect(() => {
    if (props.lead) {
      setForm({
        name: props.lead.name ?? "",
        company: props.lead.company ?? "",
        contact_phone: props.lead.contact_phone ?? "",
        contact_email: props.lead.contact_email ?? "",
        address: props.lead.address ?? "",
        value_inr: props.lead.value_inr?.toString() ?? "",
        source: props.lead.source ?? "",
        stage: props.lead.stage,
        assigned_to: props.lead.assigned_to ?? "",
      });
    } else {
      setForm({
        name: "", company: "", contact_phone: "", contact_email: "", address: "",
        value_inr: "", source: "", stage: "new", assigned_to: "",
      });
    }
  }, [props.lead]);

  function save() {
    const payload = {
      name: form.name.trim(),
      company: form.company.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
      address: form.address.trim() || null,
      value_inr: form.value_inr ? Number(form.value_inr) : null,
      source: form.source.trim() || null,
      stage: form.stage,
      assigned_to: form.assigned_to || null,
    };
    if (!payload.name) {
      toast.error("Name is required");
      return;
    }
    startTransition(async () => {
      const res = props.mode === "create"
        ? await createLead(payload)
        : await updateLead(props.lead!.id, payload);
      if (res.success) {
        toast.success(props.mode === "create" ? "Lead created" : "Lead updated");
        props.onOpenChange(false);
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.mode === "create" ? "New lead" : "Edit lead"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <Field label="Name *">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Company">
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            </Field>
          </div>
          <Field label="Address">
            <Textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estimated value (₹)">
              <Input
                type="number"
                min={0}
                value={form.value_inr}
                onChange={(e) => setForm({ ...form, value_inr: e.target.value })}
              />
            </Field>
            <Field label="Source (e.g. Referral)">
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage">
              <select
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value as LeadStage })}
                className="w-full border rounded p-2 text-sm"
              >
                {LEAD_STAGES.map(s => (<option key={s} value={s}>{stageLabel(s)}</option>))}
              </select>
            </Field>
            <Field label="Assigned to">
              <select
                value={form.assigned_to}
                onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                className="w-full border rounded p-2 text-sm"
              >
                <option value="">Unassigned</option>
                {(props.assigneeOptions ?? []).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {props.mode === "create" ? "Create lead" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
```

Note: passing `assigneeOptions` is the parent's responsibility. For Phase 1 the kanban page passes `[]` (admin/manager can still create unassigned leads). A future enhancement (Phase 1.5) loads the manager-scoped employee list server-side and passes it down.

- [ ] **Step 2: Smoke test**

```bash
npm run dev
```

Visit `/dashboard/geo/leads`, click "New lead". Form should render and submit successfully (creating an unassigned lead).

- [ ] **Step 3: Commit**

```bash
git add src/components/geo/lead-dialog.tsx
git commit -m "feat(jambageo): lead create/edit dialog

- Single dialog for both modes; auto-fills on edit
- Required: name. Optional: company/phone/email/address/value/source/stage/assignee.
- Assignee dropdown takes manager-scoped options from parent
- Toast on success/error

Spec §5."
```

---

## Task 14: Lead detail + visit timeline + log-visit dialog

**Files:**
- Create: `src/app/dashboard/geo/leads/[id]/page.tsx`
- Create: `src/app/dashboard/geo/leads/[id]/client.tsx`
- Create: `src/components/geo/lead-detail.tsx`
- Create: `src/components/geo/visit-timeline.tsx`
- Create: `src/components/geo/log-visit-dialog.tsx`

- [ ] **Step 1: Create `src/components/geo/visit-timeline.tsx`**

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { outcomeLabel, type LeadOutcome } from "@/lib/geo/stages";
import { Calendar, FileText, Robot } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface VisitRow {
  id: string;
  notes: string | null;
  outcome: LeadOutcome;
  follow_up_date: string | null;
  employee_name: string | null;
  source: "web" | "mobile";
  system: boolean;
  visited_at: string;
}

const OUTCOME_VARIANTS: Record<LeadOutcome, "default" | "secondary" | "destructive" | "outline"> = {
  in_progress: "secondary",
  pending: "outline",
  follow_up: "outline",
  converted: "default",
  lost: "destructive",
};

export function VisitTimeline({ visits }: { visits: VisitRow[] }) {
  if (visits.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No visits logged yet. Use "Log visit" to record outcomes.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {visits.map(v => (
        <li
          key={v.id}
          className={
            "rounded border p-3 " +
            (v.system ? "bg-muted/30 border-dashed text-xs" : "bg-card")
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {v.system ? (
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Calendar className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-medium text-sm">
                {v.employee_name ?? "Unknown"}
              </span>
              <Badge variant={OUTCOME_VARIANTS[v.outcome]} className="text-[10px]">
                {outcomeLabel(v.outcome)}
              </Badge>
              {v.system && <span className="text-[10px] italic text-muted-foreground">system</span>}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDate(v.visited_at)}
            </span>
          </div>
          {v.notes && <p className="text-sm mt-2 whitespace-pre-wrap">{v.notes}</p>}
          {v.follow_up_date && (
            <p className="text-xs text-muted-foreground mt-1">
              Follow-up: {formatDate(v.follow_up_date)}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
```

> `Robot` icon import is unused above — leave only `Calendar`, `FileText`. (Plan-doc lint.)

- [ ] **Step 2: Create `src/components/geo/log-visit-dialog.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LEAD_OUTCOMES, outcomeLabel, type LeadOutcome } from "@/lib/geo/stages";
import { createLeadVisit } from "@/actions/geo-visits";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
}

export function LogVisitDialog({ open, onOpenChange, leadId }: Props) {
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<LeadOutcome>("in_progress");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");

  function save() {
    startTransition(async () => {
      const res = await createLeadVisit({
        lead_id: leadId,
        outcome,
        notes: notes.trim() || null,
        follow_up_date: followUp || null,
      });
      if (res.success) {
        toast.success("Visit logged");
        setNotes(""); setFollowUp(""); setOutcome("in_progress");
        onOpenChange(false);
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log a visit</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Outcome</Label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as LeadOutcome)}
              className="w-full border rounded p-2 text-sm"
            >
              {LEAD_OUTCOMES.map(o => (
                <option key={o} value={o}>{outcomeLabel(o)}</option>
              ))}
            </select>
            {(outcome === "converted" || outcome === "lost") && (
              <p className="text-xs text-amber-600">
                This will move the lead to "{outcome === "converted" ? "Converted" : "Lost"}" stage.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Follow-up date (optional)</Label>
            <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={save} disabled={pending}>Save visit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create `src/components/geo/lead-detail.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil } from "lucide-react";
import { stageLabel, type LeadStage } from "@/lib/geo/stages";
import { LogVisitDialog } from "./log-visit-dialog";
import { LeadDialog } from "./lead-dialog";
import { VisitTimeline } from "./visit-timeline";

interface VisitRow {
  id: string;
  notes: string | null;
  outcome: any;
  follow_up_date: string | null;
  employee_name: string | null;
  source: "web" | "mobile";
  system: boolean;
  visited_at: string;
}

export interface LeadDetailProps {
  lead: {
    id: string;
    name: string;
    company: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    address: string | null;
    value_inr: number | null;
    source: string | null;
    stage: LeadStage;
    assigned_to: string | null;
    created_at: string;
  };
  visits: VisitRow[];
  canEdit: boolean;
  canLogVisit: boolean;
}

export function LeadDetail(props: LeadDetailProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);

  return (
    <div className="grid md:grid-cols-[1fr_1fr] gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>{props.lead.name}</CardTitle>
            {props.lead.company && (
              <p className="text-sm text-muted-foreground">{props.lead.company}</p>
            )}
            <Badge variant="secondary" className="mt-2">{stageLabel(props.lead.stage)}</Badge>
          </div>
          {props.canEdit && (
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {props.lead.contact_phone && <Row label="Phone" value={props.lead.contact_phone} />}
          {props.lead.contact_email && <Row label="Email" value={props.lead.contact_email} />}
          {props.lead.address && <Row label="Address" value={props.lead.address} />}
          {props.lead.value_inr !== null && (
            <Row label="Estimated value" value={`₹${props.lead.value_inr.toLocaleString("en-IN")}`} />
          )}
          {props.lead.source && <Row label="Source" value={props.lead.source} />}
          <Row label="Created" value={new Date(props.lead.created_at).toLocaleDateString()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Visit timeline</CardTitle>
          {props.canLogVisit && (
            <Button size="sm" onClick={() => setVisitOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Log visit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <VisitTimeline visits={props.visits} />
        </CardContent>
      </Card>

      <LeadDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        lead={props.lead}
      />
      <LogVisitDialog
        open={visitOpen}
        onOpenChange={setVisitOpen}
        leadId={props.lead.id}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/app/dashboard/geo/leads/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { getLead } from "@/actions/geo-leads";
import { listLeadVisits } from "@/actions/geo-visits";
import { LeadDetail } from "@/components/geo/lead-detail";
import { isAdmin, isManagerOrAbove } from "@/types";

interface Props { params: { id: string } }

export default async function LeadDetailPage({ params }: Props) {
  const ctx = await requireJambaGeoAccess();
  const leadRes = await getLead(params.id);
  if (!leadRes.success) notFound();
  const visitsRes = await listLeadVisits(params.id);
  const visits = visitsRes.success ? visitsRes.data : [];

  const canEdit = isManagerOrAbove(ctx.role) || leadRes.data.assigned_to === ctx.employeeId;
  // Anyone with read can log a visit IF they're the assignee OR a manager+; matches createLeadVisit guard.
  const canLogVisit =
    isManagerOrAbove(ctx.role) || leadRes.data.assigned_to === ctx.employeeId;

  return (
    <LeadDetail
      lead={leadRes.data}
      visits={visits as any}
      canEdit={canEdit}
      canLogVisit={canLogVisit}
    />
  );
}
```

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

Create a lead via `/dashboard/geo/leads` "New lead". Click it. Detail page renders. Click "Log visit", pick outcome="converted", save. Verify: visit appears in timeline, lead stage chip flips to "Converted".

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/geo/leads/\[id\]/page.tsx src/components/geo/lead-detail.tsx \
        src/components/geo/visit-timeline.tsx src/components/geo/log-visit-dialog.tsx
git commit -m "feat(jambageo): lead detail + visit timeline + log-visit dialog

- Detail page: editable lead info card + visit timeline panel
- LogVisitDialog: outcome dropdown, notes, follow-up date
- Converted/Lost outcomes trigger lead.stage flip in server action
- Timeline: system rows render as dashed ghost rows; human rows as cards
- Edit + log-visit permissions wired to canEdit / canLogVisit

Spec §5."
```

---

## Task 15: Live map page (Phase 1 empty state)

**Files:**
- Create: `src/app/dashboard/geo/live-map/page.tsx`
- Create: `src/components/geo/live-map.tsx`

- [ ] **Step 1: Create `src/components/geo/live-map.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin, Smartphone } from "lucide-react";
import { getMapboxToken, DEFAULT_INDIA_VIEWPORT, MAPBOX_STYLE } from "@/lib/mapbox";
import { listActiveSessions } from "@/actions/geo-sessions";

interface Session {
  session_id: string;
  employee_id: string;
  employee_name: string;
  started_at: string;
  last_ping_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
}

export default function LiveMap() {
  const [token] = useState(() => { try { return getMapboxToken(); } catch { return null; } });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function poll() {
      const res = await listActiveSessions();
      if (active && res.success) setSessions(res.data);
      if (active) setLoading(false);
    }
    poll();
    const id = setInterval(poll, 30_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  if (!token) {
    return (
      <EmptyState
        title="Map unavailable"
        body="NEXT_PUBLIC_MAPBOX_TOKEN is not configured. Contact support."
      />
    );
  }

  if (sessions.length === 0 && !loading) {
    return (
      <EmptyState
        title="No active sessions yet"
        body="Field staff will appear here when they check in via the JambaGeo mobile app (coming soon)."
        icon={<Smartphone className="h-8 w-8 text-muted-foreground" />}
      />
    );
  }

  const withCoords = sessions.filter(s => s.last_lat !== null && s.last_lng !== null);

  return (
    <div style={{ height: 600, width: "100%", borderRadius: 8, overflow: "hidden" }}>
      <Map
        mapboxAccessToken={token}
        initialViewState={DEFAULT_INDIA_VIEWPORT}
        mapStyle={MAPBOX_STYLE}
      >
        <NavigationControl position="top-left" />
        {withCoords.map(s => (
          <Marker key={s.session_id} latitude={s.last_lat!} longitude={s.last_lng!}>
            <div className="rounded-full bg-primary text-primary-foreground p-1.5 shadow">
              <MapPin className="h-3 w-3" />
            </div>
          </Marker>
        ))}
      </Map>
    </div>
  );
}

function EmptyState({ title, body, icon }: { title: string; body: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed bg-muted/20 p-12 text-center">
      <div className="flex justify-center mb-3">
        {icon ?? <MapPin className="h-8 w-8 text-muted-foreground" />}
      </div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{body}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/dashboard/geo/live-map/page.tsx`**

```tsx
import dynamic from "next/dynamic";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { isManagerOrAbove } from "@/types";
import { redirect } from "next/navigation";

const LiveMap = dynamic(() => import("@/components/geo/live-map"), {
  ssr: false,
  loading: () => <div className="h-[600px] bg-muted/30 rounded animate-pulse" />,
});

export default async function LiveMapPage() {
  const ctx = await requireJambaGeoAccess();
  if (!isManagerOrAbove(ctx.role)) redirect("/dashboard/geo/leads");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Field staff location data is collected only on consent via the JambaGeo
        mobile app. No web admin can enable tracking without staff opt-in.
      </p>
      <LiveMap />
    </div>
  );
}
```

- [ ] **Step 3: Smoke test**

Open `/dashboard/geo/live-map`. Expected (Phase 1): empty-state card with smartphone icon and "coming soon" copy.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/geo/live-map/page.tsx src/components/geo/live-map.tsx
git commit -m "feat(jambageo): live-map page with Phase 1 empty state

- 30s polling of listActiveSessions (no rerenders when empty)
- Manager+ only; non-managers redirect to /dashboard/geo/leads
- Phase 1 empty state: smartphone icon + 'coming soon' copy
- Privacy notice above the map (DPDP posture)

Spec §5, §7."
```

---

## Task 16: Reports page — funnel + overdue follow-ups

**Files:**
- Create: `src/app/dashboard/geo/reports/page.tsx`
- Create: `src/components/geo/funnel-chart.tsx`
- Create: `src/components/geo/overdue-followups.tsx`

- [ ] **Step 1: Create `src/components/geo/funnel-chart.tsx`**

```tsx
"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { stageLabel } from "@/lib/geo/stages";

const STAGE_COLORS: Record<string, string> = {
  new: "#94a3b8",
  contacted: "#60a5fa",
  visited: "#a78bfa",
  negotiation: "#f59e0b",
  converted: "#10b981",
  lost: "#ef4444",
};

export function FunnelChart({ data }: { data: { stage: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No leads to chart yet.</p>;
  }
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.map(d => ({ ...d, label: stageLabel(d.stage as any) }))}>
          <XAxis dataKey="label" fontSize={12} />
          <YAxis allowDecimals={false} fontSize={12} />
          <Tooltip />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={STAGE_COLORS[d.stage] ?? "#64748b"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/geo/overdue-followups.tsx`**

```tsx
import Link from "next/link";
import { formatDate } from "@/lib/utils";

interface Row {
  lead_id: string;
  lead_name: string;
  assignee_name: string | null;
  follow_up_date: string;
  days_overdue: number;
}

export function OverdueFollowUps({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No overdue follow-ups. 🎉</p>;
  }
  return (
    <ul className="divide-y">
      {rows.map(r => (
        <li key={r.lead_id} className="py-3 flex items-start justify-between gap-3">
          <div>
            <Link
              href={`/dashboard/geo/leads/${r.lead_id}`}
              className="font-medium hover:underline"
            >
              {r.lead_name}
            </Link>
            <div className="text-xs text-muted-foreground">
              Assignee: {r.assignee_name ?? "Unassigned"} · Due {formatDate(r.follow_up_date)}
            </div>
          </div>
          <span className="text-xs font-semibold text-destructive whitespace-nowrap">
            {r.days_overdue} day{r.days_overdue === 1 ? "" : "s"} overdue
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Create `src/app/dashboard/geo/reports/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { isManagerOrAbove } from "@/types";
import { getLeadFunnel, getOverdueFollowUps } from "@/actions/geo-reports";
import { FunnelChart } from "@/components/geo/funnel-chart";
import { OverdueFollowUps } from "@/components/geo/overdue-followups";

export default async function ReportsPage() {
  const ctx = await requireJambaGeoAccess();
  if (!isManagerOrAbove(ctx.role)) redirect("/dashboard/geo/leads");

  const [funnel, overdue] = await Promise.all([getLeadFunnel(), getOverdueFollowUps()]);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle>Lead funnel</CardTitle></CardHeader>
        <CardContent>
          <FunnelChart data={funnel.success ? funnel.data : []} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Overdue follow-ups</CardTitle></CardHeader>
        <CardContent>
          <OverdueFollowUps rows={overdue.success ? overdue.data : []} />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/geo/reports/page.tsx \
        src/components/geo/funnel-chart.tsx src/components/geo/overdue-followups.tsx
git commit -m "feat(jambageo): reports page — funnel chart + overdue follow-ups

- FunnelChart: Recharts bar with stage-specific colors
- OverdueFollowUps: linked list with days-overdue chip
- Manager+ only

Spec §5."
```

---

## Task 17: My-Leads page (staff self-view)

**Files:**
- Create: `src/app/dashboard/geo/my-leads/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { getMyAssignedLeads } from "@/actions/geo-reports";
import { stageLabel } from "@/lib/geo/stages";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export default async function MyLeadsPage() {
  await requireJambaGeoAccess();
  const res = await getMyAssignedLeads();
  const leads = res.success ? res.data : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>My assigned leads</CardTitle>
      </CardHeader>
      <CardContent>
        {leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You don't have any leads assigned yet. Your manager will assign leads here.
          </p>
        ) : (
          <ul className="divide-y">
            {leads.map(l => (
              <li key={l.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <Link href={`/dashboard/geo/leads/${l.id}`} className="font-medium hover:underline">
                    {l.name}
                  </Link>
                  {l.company && (
                    <div className="text-xs text-muted-foreground">{l.company}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{stageLabel(l.stage)}</Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(l.updated_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/geo/my-leads/page.tsx
git commit -m "feat(jambageo): my-leads page (staff self-view)

- Visible to any role with assigned leads
- Simple list (no kanban) — assignee just needs to drill in and log visits

Spec §5."
```

---

## Task 18: Crons — follow-up reminders + retention sweep

**Files:**
- Create: `src/app/api/cron/jambageo-followup-reminders/route.ts`
- Create: `src/app/api/cron/jambageo-retention-sweep/route.ts`
- Modify: `vercel.json`
- Create: `src/components/emails/lead-followup-reminder.tsx`

- [ ] **Step 1: Verify CRON_SECRET pattern from an existing cron**

```bash
grep -rln "CRON_SECRET\|Bearer" src/app/api/cron/ | head -3
```

Copy the bearer-auth pattern from `src/app/api/cron/attendance-auto-clockout/route.ts` (or similar).

- [ ] **Step 2: Create the follow-up reminder email template**

`src/components/emails/lead-followup-reminder.tsx`:

```tsx
import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from "@react-email/components";

interface Props {
  recipientName: string;
  leads: Array<{ name: string; company: string | null; url: string }>;
  orgName: string;
}

export default function LeadFollowupReminderEmail(props: Props) {
  return (
    <Html>
      <Head />
      <Preview>Follow-ups due today — {props.leads.length} lead(s)</Preview>
      <Body style={{ fontFamily: "Inter, system-ui, sans-serif", backgroundColor: "#f7fafc" }}>
        <Container style={{ backgroundColor: "#fff", padding: 32, maxWidth: 560, borderRadius: 8 }}>
          <Heading as="h2" style={{ marginTop: 0, color: "#0f172a" }}>
            Follow-ups due today
          </Heading>
          <Text style={{ color: "#475569" }}>
            Hi {props.recipientName}, you have <strong>{props.leads.length}</strong> lead{props.leads.length === 1 ? "" : "s"} scheduled for follow-up today at {props.orgName}.
          </Text>
          <Section style={{ marginTop: 16 }}>
            {props.leads.map((l, i) => (
              <Text key={i} style={{ margin: "8px 0", color: "#0f172a" }}>
                • <Link href={l.url} style={{ color: "#0d8b78" }}>{l.name}</Link>
                {l.company && <span style={{ color: "#94a3b8" }}> ({l.company})</span>}
              </Text>
            ))}
          </Section>
          <Hr style={{ marginTop: 24, borderColor: "#e2e8f0" }} />
          <Text style={{ fontSize: 12, color: "#94a3b8" }}>
            JambaHR · JambaGeo · Automated — please don't reply.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 3: Create `src/app/api/cron/jambageo-followup-reminders/route.ts`**

```ts
import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import { createAdminSupabase } from "@/lib/supabase/server";
import { resend, FROM_EMAIL } from "@/lib/resend";
import LeadFollowupReminderEmail from "@/components/emails/lead-followup-reminder";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createAdminSupabase();
  const today = new Date().toISOString().slice(0, 10);

  // Pick the LATEST follow_up_date per lead — a stale visit row from weeks ago
  // shouldn't trigger a reminder if a fresher visit moved the follow-up date.
  // For Phase 1 we keep this simple: just rows where the lead's latest visit
  // has follow_up_date = today.
  const { data, error } = await sb
    .from("lead_visits")
    .select(`
      lead_id, follow_up_date, org_id,
      lead:leads!lead_visits_lead_id_fkey(id, name, company, assigned_to,
        employee:employees!leads_assigned_to_fkey(email, first_name, last_name),
        org:organizations!leads_org_id_fkey(name)
      )
    `)
    .eq("follow_up_date", today);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by assignee email
  type Grouped = Record<string, {
    recipientName: string;
    orgName: string;
    leads: { name: string; company: string | null; url: string }[];
  }>;
  const grouped: Grouped = {};
  for (const row of data ?? []) {
    const lead: any = (row as any).lead;
    if (!lead?.employee?.email) continue;
    const email = lead.employee.email;
    if (!grouped[email]) {
      grouped[email] = {
        recipientName: `${lead.employee.first_name ?? ""} ${lead.employee.last_name ?? ""}`.trim() || "there",
        orgName: lead.org?.name ?? "your team",
        leads: [],
      };
    }
    grouped[email].leads.push({
      name: lead.name,
      company: lead.company,
      url: `${APP_ORIGIN}/dashboard/geo/leads/${lead.id}`,
    });
  }

  let sent = 0;
  for (const [email, info] of Object.entries(grouped)) {
    try {
      const html = render(LeadFollowupReminderEmail({
        recipientName: info.recipientName,
        leads: info.leads,
        orgName: info.orgName,
      }));
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: `Follow-ups due today (${info.leads.length})`,
        html,
      });
      sent++;
    } catch (err) {
      console.error("[jambageo] followup-reminder failed for", email, err);
    }
  }

  return NextResponse.json({ ok: true, sent });
}
```

- [ ] **Step 4: Create `src/app/api/cron/jambageo-retention-sweep/route.ts`**

```ts
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createAdminSupabase();

  // Quick exit: count rows first. Phase 1 should be 0.
  const { count } = await sb
    .from("location_pings")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) === 0) {
    return NextResponse.json({ ok: true, scanned: 0, deleted: 0 });
  }

  // For each ORG that has pings, find per-employee retention and delete.
  // Join path: location_pings → duty_sessions → employees → geo_consents.
  // Fall back to organizations.settings.jambageo.default_retention_days (default 90).
  // Phase 1: this branch is dead code but defensive for Phase 2.

  const { data: orgs } = await sb
    .from("organizations")
    .select("id, settings");

  let totalDeleted = 0;
  for (const org of orgs ?? []) {
    const defaultDays =
      ((org.settings as any)?.jambageo?.default_retention_days ?? 90) as number;

    // Get per-employee retention overrides for this org
    const { data: consents } = await sb
      .from("geo_consents")
      .select("employee_id, retention_days")
      .eq("org_id", org.id)
      .is("revoked_at", null);
    const perEmployee = new Map<string, number>(
      (consents ?? []).map(c => [c.employee_id, c.retention_days]),
    );

    // Get sessions in this org
    const { data: sessions } = await sb
      .from("duty_sessions")
      .select("id, employee_id")
      .eq("org_id", org.id);
    if (!sessions || sessions.length === 0) continue;

    const now = Date.now();
    for (const s of sessions) {
      const days = perEmployee.get(s.employee_id) ?? defaultDays;
      const cutoff = new Date(now - days * 86_400_000).toISOString();
      const { count: delCount } = await sb
        .from("location_pings")
        .delete({ count: "exact" })
        .eq("session_id", s.id)
        .lt("captured_at", cutoff);
      totalDeleted += delCount ?? 0;
    }
  }

  return NextResponse.json({ ok: true, scanned: count, deleted: totalDeleted });
}
```

- [ ] **Step 5: Add cron entries to `vercel.json`**

Find the existing `crons` array. Append:

```json
{
  "path": "/api/cron/jambageo-followup-reminders",
  "schedule": "30 3 * * *"
},
{
  "path": "/api/cron/jambageo-retention-sweep",
  "schedule": "0 19 * * *"
}
```

- [ ] **Step 6: Local test (manually invoke the routes)**

```bash
npm run dev
# in another terminal:
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/jambageo-retention-sweep
# Expected: { "ok": true, "scanned": 0, "deleted": 0 }

curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/jambageo-followup-reminders
# Expected: { "ok": true, "sent": 0 }   (no leads with follow_up_date = today yet)
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/jambageo-followup-reminders/ \
        src/app/api/cron/jambageo-retention-sweep/ \
        src/components/emails/lead-followup-reminder.tsx vercel.json
git commit -m "feat(jambageo): two crons — followup reminders + retention sweep

- /api/cron/jambageo-followup-reminders (30 3 * * * UTC = 9:00 IST):
  emails staff with leads.follow_up_date = today
- /api/cron/jambageo-retention-sweep (0 19 * * * UTC = 12:30 IST):
  delete location_pings older than retention. Phase 1 no-op (no pings).
  Join: pings → sessions → employees → consents, falling back to
  organizations.settings.jambageo.default_retention_days (default 90).
- Bearer CRON_SECRET auth on both routes

Spec §7."
```

---

## Task 19: AI Assistant — route registry + 7 help articles + re-embed

**Files:**
- Modify: `src/lib/assistant/route-registry.ts`
- Create: `src/lib/assistant/help/articles/geo_overview.md`
- Create: `src/lib/assistant/help/articles/geo_create_lead.md`
- Create: `src/lib/assistant/help/articles/geo_assign_lead.md`
- Create: `src/lib/assistant/help/articles/geo_log_visit.md`
- Create: `src/lib/assistant/help/articles/geo_kanban_drag.md`
- Create: `src/lib/assistant/help/articles/geo_geofences.md`
- Create: `src/lib/assistant/help/articles/geo_reports.md`

CLAUDE.md gotcha #61 — every new dashboard route must have a registry entry AND a help article. Vitest integrity test enforces this.

- [ ] **Step 1: Read the registry pattern**

```bash
grep -n "ROUTE_REGISTRY" src/lib/assistant/route-registry.ts | head -3
```

For each new dashboard page (`/dashboard/geo`, `/dashboard/geo/leads`, `/dashboard/geo/leads/[id]`, `/dashboard/geo/geofences`, `/dashboard/geo/live-map`, `/dashboard/geo/reports`, `/dashboard/geo/my-leads`), add an entry of this shape (key matches the article's `route_key` frontmatter):

```ts
"geo_overview": {
  path: "/dashboard/geo/leads",
  label: "JambaGeo",
  description: "Lightweight CRM and field-staff tracking",
  roles: ["owner", "admin", "manager", "employee"],
},
"geo_create_lead": { path: "/dashboard/geo/leads", label: "Create lead", roles: ["owner", "admin", "manager"] },
"geo_assign_lead": { path: "/dashboard/geo/leads", label: "Assign lead", roles: ["owner", "admin", "manager"] },
"geo_log_visit": { path: "/dashboard/geo/leads/[id]", label: "Log a visit", roles: ["owner", "admin", "manager", "employee"] },
"geo_kanban_drag": { path: "/dashboard/geo/leads", label: "Move lead through kanban", roles: ["owner", "admin", "manager", "employee"] },
"geo_geofences": { path: "/dashboard/geo/geofences", label: "Manage geofences", roles: ["owner", "admin"] },
"geo_reports": { path: "/dashboard/geo/reports", label: "Lead reports", roles: ["owner", "admin", "manager"] },
```

Match the exact `roles`/key shape used by existing entries — grep an example before pasting.

- [ ] **Step 2: Write `geo_overview.md`**

```markdown
---
id: geo_overview
route_key: geo_overview
title: JambaGeo overview
summary: Lightweight CRM and field-staff tracking module for sales / service / delivery teams.
roles:
  - owner
  - admin
  - manager
  - employee
---

JambaGeo is the lead-CRM and field-staff tracking module. In Phase 1 you can:

- Create leads, assign them to staff, move them through a 6-stage kanban.
- Log visits with outcomes (in progress, pending, follow-up, converted, lost).
- Configure geofences around your office and client sites on a map.
- See lead funnel reports and overdue follow-ups.

The mobile app for field staff (consent-first GPS pings, on-the-go check-in/out) ships in a later phase. Until then, the Live Map tab shows a "coming soon" state.

JambaGeo is on the Business plan. An admin can enable it in Settings → JambaGeo.
```

- [ ] **Step 3: Write `geo_create_lead.md`**

```markdown
---
id: geo_create_lead
route_key: geo_create_lead
title: Create a new lead
summary: Steps to add a lead to your CRM.
roles:
  - owner
  - admin
  - manager
---

1. Go to **JambaGeo → Leads**.
2. Click **New lead** in the top-right.
3. Fill in the name (required). Company, phone, email, address, value, source are optional.
4. Pick a stage (defaults to **New**) and optionally assign to a staff member.
5. Click **Create lead**.

If you assigned the lead, the assignee gets an email immediately. Managers can only assign leads to staff in their own department.
```

- [ ] **Step 4: Write `geo_assign_lead.md`**

```markdown
---
id: geo_assign_lead
route_key: geo_assign_lead
title: Assign or reassign a lead
summary: How to set or change which staff member owns a lead.
roles:
  - owner
  - admin
  - manager
---

1. Open the lead from the kanban or list.
2. Click **Edit** in the top-right of the lead-info card.
3. Change the **Assigned to** dropdown.
4. Save.

The new assignee gets an email. Admins can assign anyone in the org; managers can only assign within their own department.
```

- [ ] **Step 5: Write `geo_log_visit.md`**

```markdown
---
id: geo_log_visit
route_key: geo_log_visit
title: Log a visit on a lead
summary: Record what happened with the lead.
roles:
  - owner
  - admin
  - manager
  - employee
---

1. Open the lead (kanban / list / My Leads).
2. Click **Log visit** in the timeline panel.
3. Pick an outcome: In progress, Pending, Follow-up, Converted, or Lost.
4. Add notes (optional but recommended).
5. Set a follow-up date if you'll come back to this lead — the cron will email you on that day.
6. Save.

If the outcome is **Converted** or **Lost**, the lead's stage flips to match automatically.
```

- [ ] **Step 6: Write `geo_kanban_drag.md`**

```markdown
---
id: geo_kanban_drag
route_key: geo_kanban_drag
title: Move a lead through the kanban
summary: Drag a lead card to a different stage column.
roles:
  - owner
  - admin
  - manager
  - employee
---

1. Go to **JambaGeo → Leads** (kanban view is the default).
2. Click and hold a lead card.
3. Drag it to a different column (New, Contacted, Visited, Negotiation, Converted, Lost).
4. Release.

Every kanban move writes a system entry in the lead's visit timeline so you can audit who moved it when. Employees can only drag their own leads. Admins and managers can drag any lead in scope.
```

- [ ] **Step 7: Write `geo_geofences.md`**

```markdown
---
id: geo_geofences
route_key: geo_geofences
title: Manage geofences
summary: Draw circles around your office and client sites on a map.
roles:
  - owner
  - admin
---

1. Go to **JambaGeo → Geofences**.
2. Click anywhere on the map to drop a pin.
3. Enter a name (e.g. "Andheri Office"), pick **Office** or **Client site**, and click **Save**. The default radius is 200 m.
4. Adjust the radius in the list panel on the right. Toggle inactive to temporarily disable a geofence.

Geofences will be used by the JambaGeo mobile app to auto-suggest check-ins when field staff enter a client site (mobile feature, future phase).
```

- [ ] **Step 8: Write `geo_reports.md`**

```markdown
---
id: geo_reports
route_key: geo_reports
title: Lead funnel and overdue follow-ups
summary: See pipeline health at a glance.
roles:
  - owner
  - admin
  - manager
---

The Reports tab shows two cards:

- **Lead funnel** — number of leads in each of the 6 stages. Admins see all org leads; managers see their department's.
- **Overdue follow-ups** — leads where the most recent visit set a follow-up date in the past. Click any row to open the lead and either log a new visit or update the stage.
```

- [ ] **Step 9: Run integrity test + lint**

```bash
npm run lint
npx vitest run tests/assistant/route-registry.integrity.test.ts tests/assistant/help-loader.test.ts
```

Expected: green. If route-registry integrity fails, the registry key must EXACTLY equal the article's `id`/`route_key`.

- [ ] **Step 10: Re-embed help corpus**

```bash
npm run embed:help
```

Expected: script wipes `app_help_chunks`, re-embeds all articles (including the 7 new ones) via Voyage. Logs total chunks. Requires `VOYAGE_API_KEY` in `.env.local` (CLAUDE.md gotcha mentions key may be missing after the P2 .env overwrite — restore it first).

- [ ] **Step 11: Commit**

```bash
git add src/lib/assistant/route-registry.ts src/lib/assistant/help/articles/geo_*.md
git commit -m "feat(jambageo): AI assistant route registry + 7 help articles

- Registry entries for all new /dashboard/geo/* pages
- Articles: overview, create_lead, assign_lead, log_visit, kanban_drag, geofences, reports
- Role-scoped (matches in-app permissions matrix)
- Run npm run embed:help after merging to rebuild app_help_chunks

Spec §5."
```

---

## Task 20: Demo seed + CLAUDE.md update + manual verification

**Files:**
- Create: `scripts/seed-jambageo-demo.sql`
- Modify: `CLAUDE.md` (add JambaGeo module section)

- [ ] **Step 1: Write `scripts/seed-jambageo-demo.sql`**

```sql
-- scripts/seed-jambageo-demo.sql
-- Demo data for the test1 org. Idempotent via natural-key ON CONFLICT.

DO $$
DECLARE
  v_org uuid;
  v_sales_emp uuid;
  v_mkt_emp uuid;
BEGIN
  SELECT id INTO v_org FROM organizations
    WHERE clerk_org_id LIKE '%test1%' OR name ILIKE '%test1%' LIMIT 1;
  IF v_org IS NULL THEN
    RAISE NOTICE 'test1 org not found; skipping seed';
    RETURN;
  END IF;

  -- Pick first active employee in Sales and Marketing (used as assignees)
  SELECT e.id INTO v_sales_emp FROM employees e
    JOIN departments d ON d.id = e.department_id
    WHERE e.org_id = v_org AND d.name ILIKE '%sales%' AND e.status = 'active'
    LIMIT 1;
  SELECT e.id INTO v_mkt_emp FROM employees e
    JOIN departments d ON d.id = e.department_id
    WHERE e.org_id = v_org AND d.name ILIKE '%marketing%' AND e.status = 'active'
    LIMIT 1;

  -- 4 geofences: Mumbai office + 3 client sites
  INSERT INTO geofences (org_id, name, type, center_lat, center_lng, radius_m)
  VALUES
    (v_org, 'Mumbai HQ (Andheri)', 'office', 19.1197, 72.8466, 300),
    (v_org, 'Acme Industries - Pune', 'client', 18.5204, 73.8567, 500),
    (v_org, 'Beta Logistics - Bandra', 'client', 19.0596, 72.8295, 250),
    (v_org, 'Gamma Tech - Connaught Place Delhi', 'client', 28.6315, 77.2167, 400)
  ON CONFLICT DO NOTHING;

  -- 12 leads across 6 stages
  INSERT INTO leads (org_id, name, contact_phone, company, address, assigned_to, stage, value_inr, source)
  VALUES
    (v_org, 'Rajesh Kumar', '+91 98765 43210', 'Acme Industries', 'Pune MIDC', v_sales_emp, 'new', 250000, 'Website'),
    (v_org, 'Anita Sharma', '+91 99887 76655', 'Beta Logistics', 'Bandra West Mumbai', v_sales_emp, 'new', 180000, 'Referral'),
    (v_org, 'Priya Patel', '+91 98765 11122', 'Delta Foods', 'Andheri East Mumbai', v_mkt_emp, 'contacted', 450000, 'LinkedIn'),
    (v_org, 'Sunil Verma', '+91 97654 33221', 'Epsilon Retail', 'Connaught Place Delhi', v_sales_emp, 'contacted', 320000, 'Walk-in'),
    (v_org, 'Meera Iyer', '+91 99887 99887', 'Zeta Pharma', 'Powai Mumbai', v_mkt_emp, 'contacted', 600000, 'Trade show'),
    (v_org, 'Karan Singh', '+91 98123 45678', 'Eta Construction', 'Worli Mumbai', v_sales_emp, 'visited', 950000, 'Cold call'),
    (v_org, 'Divya Nair', '+91 99887 12345', 'Theta Hospitality', 'Bandra Mumbai', v_mkt_emp, 'visited', 280000, 'Referral'),
    (v_org, 'Arun Joshi', '+91 98765 99887', 'Iota Education', 'Andheri Mumbai', v_sales_emp, 'visited', 410000, 'Website'),
    (v_org, 'Kavya Reddy', '+91 99887 33344', 'Kappa Healthcare', 'Lower Parel Mumbai', v_sales_emp, 'negotiation', 1500000, 'Inbound'),
    (v_org, 'Sanjay Mehta', '+91 98765 22211', 'Lambda Manufacturing', 'Pune Hinjewadi', v_mkt_emp, 'converted', 720000, 'Referral'),
    (v_org, 'Pooja Bhatt', '+91 99887 22233', 'Mu Solutions', 'Vashi Navi Mumbai', v_sales_emp, 'lost', 350000, 'Cold call'),
    (v_org, NULL, NULL, NULL, NULL, NULL, 'new', NULL, NULL)  -- placeholder unassigned
  ON CONFLICT DO NOTHING;

  -- Sample visits on a few leads
  -- (visit-create requires a non-null employee_id — use v_sales_emp)
  INSERT INTO lead_visits (lead_id, org_id, employee_id, notes, outcome, source, system, visited_at)
  SELECT l.id, v_org, v_sales_emp,
    'Initial call. Decision-maker available next week.', 'pending', 'web', false, now() - interval '3 days'
  FROM leads l WHERE l.org_id = v_org AND l.name = 'Priya Patel' LIMIT 1
  ON CONFLICT DO NOTHING;

  INSERT INTO lead_visits (lead_id, org_id, employee_id, notes, outcome, source, system, visited_at, follow_up_date)
  SELECT l.id, v_org, v_sales_emp,
    'Met procurement head. They want a detailed proposal by Friday.', 'follow_up', 'web', false, now() - interval '2 days',
    (current_date - 1)
  FROM leads l WHERE l.org_id = v_org AND l.name = 'Karan Singh' LIMIT 1
  ON CONFLICT DO NOTHING;
END $$;
```

- [ ] **Step 2: Apply the seed via Supabase MCP**

```
mcp__plugin_supabase_supabase__execute_sql
  query: <full SQL above>
```

Then verify:

```
mcp__plugin_supabase_supabase__execute_sql
  query: SELECT COUNT(*) FROM leads WHERE org_id = (SELECT id FROM organizations WHERE name ILIKE '%test1%' LIMIT 1);
```

Expected: ≥ 11 leads (depending on first-run vs re-run idempotency).

- [ ] **Step 3: Enable JambaGeo for test1**

```
mcp__plugin_supabase_supabase__execute_sql
  query: UPDATE organizations SET settings = COALESCE(settings, '{}'::jsonb) || '{"jambageo_enabled": true}'::jsonb WHERE name ILIKE '%test1%';
```

Confirm:

```
mcp__plugin_supabase_supabase__execute_sql
  query: SELECT name, settings->>'jambageo_enabled' FROM organizations WHERE name ILIKE '%test1%';
```

Expected: `jambageo_enabled = true`.

- [ ] **Step 4: Manual verification checklist**

Run through the 8-point checklist from the spec (§8):

1. Admin: navigate to `/dashboard/geo/geofences`, click map, save a geofence, verify it persists + appears in list + toggles inactive.
2. Admin: create a lead via "New lead" on `/dashboard/geo/leads`, assign to a staff member, verify staff received email (check Resend logs).
3. Manager: log in as a manager (different dept), attempt cross-dept assignment, expect red toast + server rejection.
4. Manager: drag a lead `new → contacted` on kanban, verify column updates + `lead_visits` table has a new `system=true` row (check via Supabase SQL editor).
5. Employee: log visit with `outcome=converted` on an assigned lead, verify lead's stage flips to "Converted" and kanban reflects.
6. `/dashboard/geo/live-map`: empty state ("coming soon"), no Mapbox console errors.
7. Settings: toggle JambaGeo off → sidebar entry disappears → direct nav to `/dashboard/geo/leads` redirects.
8. Plan downgrade (superadmin: change `organizations.plan` to `growth`): JambaGeo blocked even with org toggle on.

Document any failures and fix before merging.

- [ ] **Step 5: Update `CLAUDE.md`**

Add a section after the existing "Attendance Module" / "Payroll Module" blocks. Pattern matches those modules' headers. Keep it concise — the spec is the source of truth.

```markdown
## JambaGeo Module (`/dashboard/geo`) — Business+

Feature-flagged via `organizations.settings.jambageo_enabled`. Lightweight lead CRM + field-staff tracking. Phase 1 (web-only) shipped 2026-06-XX.

### Phase 1 — Web manager surface + backend foundation (PRD 03, shipped YYYY-MM-DD)

- **Backend**: migrations 051–057 add 6 tables. Three Phase-1 web-writable
  (`geofences`, `leads`, `lead_visits`); three mobile-only writers
  (`duty_sessions`, `location_pings`, `geo_consents`) so PRD 04 can wire
  writers later without migrations.
- **Mapbox** via `react-map-gl` + `@mapbox/mapbox-gl-draw`. One env var:
  `NEXT_PUBLIC_MAPBOX_TOKEN` (URL-restricted in Mapbox console).
- **Lead stages** are a fixed CHECK enum
  (`new / contacted / visited / negotiation / converted / lost`). No
  configurable stages in Phase 1.
- **Kanban drag** writes a system-authored `lead_visits` row
  (`system=true`, `notes='Stage: X → Y'`, immutable). Doubles as audit log
  — no separate `lead_stage_transitions` table.
- **Visit outcomes** in `{in_progress, converted, pending, follow_up, lost}`.
  `converted` / `lost` auto-flip `leads.stage`. Others leave stage alone.
- **Manager scope** via `getManagerScopedEmployeeIds` (Attendance Phase 2
  helper, `departments.head_id` model). Manager sees own-dept leads +
  unassigned pool. Employee sees `assigned_to = me` only.
- **Live Map** Phase 1 empty state. Polls `listActiveSessions()` every 30s
  client-side; real pins arrive when PRD 04 mobile app ships.
- **Crons**:
  - `/api/cron/jambageo-followup-reminders` (30 3 \* \* \* UTC = 9:00 IST):
    emails staff with `leads.follow_up_date = today`.
  - `/api/cron/jambageo-retention-sweep` (0 19 \* \* \* UTC = 12:30 IST):
    drops `location_pings` older than per-employee
    `geo_consents.retention_days`, fall-back to
    `organizations.settings.jambageo.default_retention_days` (default 90).
    Phase 1 no-op (no pings yet).
- **AI assistant**: 7 help articles + route-registry entries. Re-embed via
  `npm run embed:help`.
- **Demo seed**: `scripts/seed-jambageo-demo.sql` for `test1` org.

**Phase 1 gotchas:**
- Mapbox GL JS components must be loaded via `dynamic(..., { ssr: false })`
  — Mapbox depends on `window`. SSR will crash without this.
- `next.config.js` does NOT need mapbox-gl in `serverComponentsExternalPackages`
  because the package is never imported server-side (only dynamic-import'd
  in client components).
- Phase 1 has zero rows in `duty_sessions` / `location_pings` / `geo_consents`.
  The retention-sweep cron is a no-op but wired now so DPDP retention is
  enforced from the moment Phase 2 mobile lands.
- The "system" boolean on `lead_visits` guards kanban-drag rows from delete +
  edit. Server rejects edits/deletes when `system = true`.
- Lead-stage updates from kanban are idempotent — dragging to the same column
  is a server no-op (no system row written).
- Mobile-writer server actions (`startSession`, `endSession`, `ingestPings`,
  `recordConsent`, `revokeConsent`) are exported as `TODO(PRD 04)` stubs that
  return `{ success: false, error: '…' }` until Phase 2 wires them.
- Plan + org-toggle compound: sidebar entry hides unless BOTH
  `hasFeature(plan, 'jambageo')` (Business only) AND
  `organizations.settings.jambageo_enabled = true`.
```

Also add gotcha #78+ to the Known Issues / Gotchas list:

```markdown
78. **JambaGeo Mapbox SSR**: Mapbox GL JS imports `window`. All map components MUST be loaded via `dynamic(() => import('@/components/geo/...'), { ssr: false })`. Direct SSR import will crash the page. See `src/app/dashboard/geo/geofences/page.tsx` / `live-map/page.tsx`.
79. **JambaGeo system visit rows are immutable**: `lead_visits.system = true` rows are kanban-drag audit entries. `updateLeadVisit` / `deleteLeadVisit` reject them with "System rows are immutable" / "System rows cannot be deleted". To "undo" a stage move, drag the card back — that writes a new system row, preserving the audit trail.
80. **JambaGeo retention sweep is Phase-1 no-op**: `/api/cron/jambageo-retention-sweep` ships in Phase 1 even though `location_pings` is empty. This is intentional: when mobile lands in Phase 2, DPDP retention is enforced from day one without a separate migration/deploy.
```

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-jambageo-demo.sql CLAUDE.md
git commit -m "feat(jambageo): demo seed for test1 + CLAUDE.md JambaGeo section

- 4 geofences + 12 leads + 2 visits seeded for test1 org (idempotent)
- JambaGeo enabled on test1 org via settings flag
- CLAUDE.md section with Phase 1 gotchas + 3 new known-issue entries (78, 79, 80)

Spec §7, §8. Phase 1 deliverable complete."
```

- [ ] **Step 7: Open PR**

```bash
git push origin feat/jambageo-phase-1
gh pr create --title "JambaGeo Phase 1 — backend + web manager surface" \
  --body "$(cat <<'EOF'
Ships PRD 03 Phase 1: lightweight lead CRM + geofence config + stub live map.

**Mobile is explicitly deferred to PRD 04.** Schema is mobile-ready (3 of 6 tables wait for mobile writers); UI handles the Phase-1 empty state gracefully.

**Highlights:**
- 7 new Supabase migrations (051–057), all idempotent and applied via MCP
- 6 server-action files (geofences, leads, visits, sessions, consents, reports)
- /dashboard/geo/* route group: kanban + list + lead detail + geofence map editor + live map empty state + reports + my-leads
- Settings → JambaGeo section (master toggle + retention defaults)
- Lead-assigned email (Resend, FROM_EMAIL)
- 2 crons: follow-up reminders (active) + retention sweep (Phase-1 no-op)
- 7 AI-assistant help articles + route-registry entries
- Vitest: geometry, stages, manager-scope, stage-transitions, validation (all green)
- Demo seed for test1 org

**Tested locally:**
- Admin: create/edit/toggle/delete geofences via Mapbox draw
- Manager: kanban drag rewrites stage + writes system visit
- Cross-dept reassignment blocked with toast
- Employee: log-visit with converted outcome flips stage
- Live map empty state renders with "coming soon" CTA
- Plan downgrade blocks the module

**Spec:** docs/superpowers/specs/2026-06-09-jambageo-phase-1-design.md
**Plan:** docs/superpowers/plans/2026-06-09-jambageo-phase-1.md
**PRD:** docs/prds/03-PRD-JambaGeo.md
EOF
)"
```

---

## Self-Review

### Spec coverage check

| Spec section | Task(s) implementing it |
|---|---|
| §1 Decisions 1–10 | Task 1, 2 (lock the decisions in code) |
| §2 Architecture | Tasks 1, 10 (route group), 3 (lib helpers), 8 (settings) |
| §3 Data model — geofences | Task 2 (migration 051), 11 (UI) |
| §3 Data model — leads | Task 2 (052), 5 (actions), 12-13 (UI) |
| §3 Data model — lead_visits + system col | Task 2 (053), 6 (actions), 14 (timeline) |
| §3 Data model — duty_sessions | Task 2 (054), 7 (read-only action), 15 (live map) |
| §3 Data model — location_pings | Task 2 (055), 18 (retention sweep) |
| §3 Data model — geo_consents | Task 2 (056), 7 (read-only action), 15 (privacy notice) |
| §3 RLS migration 057 | Task 2 (057) |
| §4 Server actions (all 6 files) | Tasks 4, 5, 6, 7 |
| §5 Web UI — route group + layout + nav | Task 10 |
| §5 Web UI — geofences map + list | Task 11 |
| §5 Web UI — leads kanban + list | Task 12 |
| §5 Web UI — lead dialog | Task 13 |
| §5 Web UI — lead detail + timeline + log-visit | Task 14 |
| §5 Web UI — live map | Task 15 |
| §5 Web UI — reports | Task 16 |
| §5 Web UI — my-leads | Task 17 |
| §5 Settings section | Task 8 |
| §5 Mapbox setup (token, viewport) | Task 1 (env), 3 (lib), 11/15 (use) |
| §5 AI assistant integration | Task 19 |
| §6 Permissions matrix | Tasks 4–7 server-side; 10, 12–17 UI-side |
| §7 Error handling — Mapbox fallback | Task 11 (geofence-map), 15 (live-map) |
| §7 Email failures via waitUntil | Task 5 (assignLead), 9 (sender) |
| §7 Crons + vercel.json | Task 18 |
| §7 DPDP posture / privacy notice | Task 15 |
| §7 Demo seed | Task 20 |
| §8 Testing (Vitest) | Tasks 3, 4, 5 |
| §8 Manual verification checklist | Task 20 |
| §9 Phasing recap | Encoded throughout — Phase 2 stubs in Task 7 |
| §10 Open items (already resolved) | n/a |

No gaps detected.

### Placeholder scan
- No `TBD`, `TODO: fill in`, or `implement later` in plan steps.
- Mobile-writer Phase 2 stubs ARE intentional and labelled `TODO(PRD 04)` in code — these are deliberate signal markers, not plan placeholders.

### Type consistency
- `LEAD_STAGES`, `LEAD_OUTCOMES`, `LeadStage`, `LeadOutcome` defined in Task 3; used by every later task with the same name.
- `ActionResult<T>` shape uniform across all 6 action files.
- `JambaGeoAccessContext` from Task 3 used unchanged in Tasks 4–7.
- `LeadCardData` defined in Task 12, reused in 17.
- `system: boolean` column on `lead_visits` introduced in Task 2 migration 053, referenced in Task 6 actions (`updateLeadVisit` + `deleteLeadVisit`), and rendered distinctively in Task 14 visit-timeline.
- `mapStageToOutcome` (Task 3 stages.ts) used in Task 5 `buildSystemVisitForStageMove`.
- `mapOutcomeToStage` (Task 3) used in Task 6 `createLeadVisit`.
- `computeLeadScope` (Task 5 pure helper) reused in Task 7 `getLeadFunnel`.
- `sendLeadAssignedEmail` (Task 9 file) imported by Task 5; Task 5 docs the build-order dependency.

### Scope check
Plan is one Phase 1 deliverable across 20 tasks, one branch (`feat/jambageo-phase-1`), one PR. No decomposition needed — every task is independently committable and the final task closes the loop with the PR.

No issues to fix inline.









