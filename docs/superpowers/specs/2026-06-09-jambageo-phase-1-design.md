# JambaGeo — Phase 1 Design (Web Manager Surface + Backend Foundation)

**Date:** 2026-06-09
**Author:** Amol + Claude (brainstorming)
**PRD:** [`docs/prds/03-PRD-JambaGeo.md`](../../prds/03-PRD-JambaGeo.md)
**Status:** Approved — ready for implementation plan
**Depends on (PRD-level):** PRD 04 (Mobile Apps) — Phase 2 only; Phase 1 has no mobile dependency

---

## Goal

Ship the **backend + web manager surface** of JambaGeo (field-staff tracking + lightweight lead CRM) in the existing Next.js portal, leaving a clean schema for the future Expo mobile app (PRD 04) to write into without further migrations.

**Phase 1 is a usable Business-tier feature on its own**: admins/managers get a lightweight CRM (leads, kanban, manual visit logging), geofence configuration, a stubbed live map, and reports — all working day one without the mobile app.

## Non-goals (Phase 1)

- No mobile app (Expo / React Native) — that's PRD 04.
- No GPS pings collected — `location_pings` table exists but has no writers.
- No DPDP consent capture — `geo_consents` table exists; mobile will write to it.
- No PostGIS — plain `numeric(9,6)` lat/lng columns. Revisit in Phase 2.
- No configurable lead stages per org — fixed CHECK enum. Phase 2.
- No photo-on-visit — column reserved on `lead_visits` for Phase 2.
- No external CRM integration — Phase 3.
- No per-lead audit/transition table like `candidate_stage_transitions` — kanban moves are captured as system-authored `lead_visit` rows.

---

## 1. Decisions (locked during brainstorming)

| # | Topic | Decision | Trade-off accepted |
|---|---|---|---|
| 1 | Scope | Backend + web manager view in this Next.js repo; mobile deferred to PRD 04 | No field-staff app in Phase 1 |
| 2 | Deliverable shape | Lightweight CRM + geofence config + real map with empty-state for live tracking | Live-map empty state ships before any mobile data exists |
| 3 | Plan gating | Business tier only + `organizations.settings.jambageo_enabled` toggle (mirrors JambaHire) | Smaller orgs can't try it without Business upgrade |
| 4 | Maps provider | Mapbox via `react-map-gl` + `@mapbox/mapbox-gl-draw` | Mapbox token + URL allowlist required; free tier covers SMB usage |
| 5 | Geospatial indexing | Plain `numeric(9,6)` lat/lng — no PostGIS Phase 1 | Add PostGIS in Phase 2 if heatmaps/proximity queries demand it |
| 6 | Manager scope | `departments.head_id` model (matches Attendance Phase 2) — reuse `getManagerScopedEmployeeIds` | No per-lead `manager_id` flexibility |
| 7 | Stage model | Fixed CHECK enum (`new / contacted / visited / negotiation / converted / lost`) | Configurable stages deferred to Phase 2 |
| 8 | Audit | No `lead_stage_transitions` table — kanban moves written as system `lead_visit` rows | Less granular audit; visit timeline doubles as audit log |
| 9 | Manager scope on unassigned leads | Unassigned leads visible to managers (so they can claim/route) | Slightly broader visibility than strict scope |
| 10 | Notifications | Lead-assigned email via Resend; follow-up reminder cron | More email volume; admins can disable per-employee in future |

---

## 2. Architecture

**All Phase 1 work lives in `hr-portal`** (Next.js 14, App Router). Schema is mobile-ready so PRD 04 can wire writers later without migrations.

**Module surface (mirrors JambaHire's shape):**

- Route group: `src/app/dashboard/geo/*` (no public routes — unlike JambaHire's `/careers` + `/offers` siblings, JambaGeo has no unauthenticated surface in Phase 1).
- Server actions: `src/actions/geo-leads.ts`, `geo-geofences.ts`, `geo-visits.ts`, `geo-sessions.ts`, `geo-consents.ts`, `geo-reports.ts`.
- Lib helpers: `src/lib/jambageo-access.ts` (gate), `src/lib/geo/geometry.ts` (haversine + point-in-circle), `src/lib/geo/stages.ts` (stage→outcome helper), `src/lib/mapbox.ts` (token + viewport helpers).
- Components: `src/components/geo/` (kanban, lead-dialog, visit-timeline, geofence-map, live-map, etc.).
- Settings: `src/components/settings/jambageo-section.tsx` (CollapsibleSection, admin-only).
- Plan feature: `jambageo` added to `src/config/plans.ts` Business tier.
- Org flag: `organizations.settings.jambageo_enabled` (writes via Settings UI).
- `getCurrentUser()` returns new `jambaGeoEnabled` field.
- AI assistant: new route registry entries + 7 help articles + re-embed.
- One env var: `NEXT_PUBLIC_MAPBOX_TOKEN` (URL-restricted in Mapbox console).

**Reused infra:** Clerk org/role model, Supabase admin client + RLS-bypass pattern (gotcha #5), Resend for email, `sonner` for toasts, `lucide-react` for icons, `@dnd-kit/*` for kanban drag (already installed for JambaHire pipeline), shadcn primitives, settings accordion pattern.

---

## 3. Data Model

Six new tables. Three Phase 1 web-writable, three mobile-only writers (Phase 1 web reads).

All tables denormalise `org_id` on child rows because Clerk-JWT RLS policies (`auth.jwt() ->> 'org_id'`) join cleanly on it — same pattern as `payroll_line_items` and `disbursement_items`.

### Phase 1 web-writable

**`geofences`**
- `id uuid pk default gen_random_uuid()`
- `org_id uuid not null fk → organizations(id) on delete cascade`
- `name text not null`
- `type text not null check (type in ('client','office'))`
- `center_lat numeric(9,6) not null`
- `center_lng numeric(9,6) not null`
- `radius_m integer not null check (radius_m between 1 and 5000)`
- `is_active boolean not null default true`
- `notes text null`
- `created_by uuid null fk → employees(id)`
- `created_at`, `updated_at` (trigger)
- Indexes: `(org_id, is_active)`, `(org_id, type)`
- Admin writes; all org members read.

**`leads`**
- `id uuid pk`
- `org_id uuid not null fk → organizations(id)`
- `name text not null`
- `contact_phone text null` (no validation Phase 1)
- `contact_email text null`
- `company text null`
- `lat numeric(9,6) null` / `lng numeric(9,6) null`
- `address text null`
- `assigned_to uuid null fk → employees(id) on delete set null`
- `stage text not null default 'new' check (stage in ('new','contacted','visited','negotiation','converted','lost'))`
- `value_inr numeric(12,2) null check (value_inr is null or value_inr >= 0)`
- `source text null` (freeform Phase 1)
- `created_by uuid null fk → employees(id)`
- `created_at`, `updated_at`
- Indexes: `(org_id, stage)`, `(org_id, assigned_to)`, `(org_id, updated_at desc)`

**`lead_visits`**
- `id uuid pk`
- `lead_id uuid not null fk → leads(id) on delete cascade`
- `org_id uuid not null fk` (denormalised for RLS + retention sweeps)
- `employee_id uuid not null fk → employees(id)`
- `session_id uuid null fk → duty_sessions(id) on delete set null` (web-logged = NULL; mobile-logged set)
- `lat numeric(9,6) null` / `lng numeric(9,6) null`
- `notes text null`
- `outcome text not null check (outcome in ('in_progress','converted','pending','follow_up','lost'))`
- `follow_up_date date null`
- `photo_url text null` (reserved for Phase 2)
- `source text not null default 'web' check (source in ('web','mobile'))`
- `system boolean not null default false` — `true` for kanban-drag-authored stage-transition rows; protects them from `deleteLeadVisit` (UI/server guard)
- `visited_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`
- Indexes: `(lead_id, visited_at desc)`, `(org_id, visited_at desc)`, partial index `(org_id, follow_up_date) where follow_up_date is not null`

### Mobile-writer tables (Phase 1 reads only)

**`duty_sessions`**
- `id`, `org_id`, `employee_id fk → employees(id)`
- `shift_id uuid null fk → shifts(id)` (links to Attendance Phase 1 shift)
- `started_at timestamptz not null`
- `ended_at timestamptz null` (NULL = active)
- `status text not null default 'active' check (status in ('active','ended','auto_ended'))`
- `last_ping_at timestamptz null`, `last_lat numeric(9,6) null`, `last_lng numeric(9,6) null` (denormalised so live-map doesn't query pings)
- `created_at`
- Indexes: partial `(org_id) where status = 'active'`, `(employee_id, started_at desc)`

**`location_pings`**
- `id`, `session_id fk → duty_sessions(id) on delete cascade`, `org_id` (denormalised)
- `lat`, `lng`, `accuracy_m numeric(7,2) null`, `battery_pct integer null check (battery_pct between 0 and 100)`
- `captured_at`, `synced_at`
- Indexes: `(session_id, captured_at desc)`, `(org_id, captured_at)` for retention sweeps

**`geo_consents`**
- `id`, `org_id`, `employee_id fk → employees(id)`
- `granted_at timestamptz null`, `revoked_at timestamptz null`
- `retention_days integer not null default 90 check (retention_days between 1 and 365)`
- `app_version text null`
- `created_at`, `updated_at`
- Partial unique: `(org_id, employee_id) where revoked_at is null` (one active consent per employee)

### RLS

Clerk-JWT pattern (`auth.jwt() ->> 'org_id'` + `org_role IN ('org:owner','org:admin')` for admin policies), matching `018_payroll_schema_capture.sql`. Service role bypasses today (gotcha #5).

| Table | Read | Write |
|---|---|---|
| `geofences` | all org members | admin only |
| `leads` | admin all / manager dept-scoped + unassigned / staff own only | admin/manager within scope; staff own only for stage |
| `lead_visits` | follows parent lead scope | author + manager+ within scope |
| `duty_sessions` | admin all / manager dept-scoped / staff own | mobile only (Phase 2) |
| `location_pings` | admin/manager (via session FK) | mobile only |
| `geo_consents` | admin all / employee own | mobile only |

### Migration files

Next free number is `051` per CLAUDE.md (last is `048`; memory S236 records `049`+`050` applied for disbursement).

- `051_jambageo_geofences.sql`
- `052_jambageo_leads.sql`
- `053_jambageo_lead_visits.sql`
- `054_jambageo_duty_sessions.sql`
- `055_jambageo_location_pings.sql`
- `056_jambageo_geo_consents.sql`
- `057_jambageo_rls.sql` (policies separated from DDL per established pattern)

All idempotent: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`.

### Why no `lead_stage_transitions` table

JambaHire's `candidate_stage_transitions` exists because pipeline moves there have rich per-action side effects (LOI, manager notify, offer revoke). JambaGeo lead moves are simpler — the human-meaningful event is the **visit**, which we already log. Kanban drag writes a system-authored `lead_visit` row (`notes = "Stage moved: contacted → negotiation"`, `outcome = mapStageToOutcome(stage)`, `source = 'web'`). The visit timeline doubles as the audit log. Add a dedicated transitions table in Phase 2 only if customer demand exists.

---

## 4. Server Actions

All actions:
- Return `ActionResult<T>`.
- Gate on `requireJambaGeoAccess(user)` (new helper; mirrors `requireJambaHireAccess`).
- Zod-validate inputs.
- Manager scope via existing `getManagerScopedEmployeeIds(orgId, managerId)` from Attendance Phase 2.
- Revalidate `/dashboard/geo` AND `/dashboard/settings` where relevant (gotcha #76).

### `src/actions/geo-geofences.ts`
- `listGeofences()` — any authed
- `createGeofence({name,type,center_lat,center_lng,radius_m,notes?})` — admin
- `updateGeofence(id, patch)` — admin
- `toggleGeofenceActive(id, is_active)` — admin
- `deleteGeofence(id)` — admin, hard delete

### `src/actions/geo-leads.ts`
- `listLeads({stage?, assigned_to?, search?, follow_up_due?})` — role-scoped server-side filter
- `getLead(id)` — role-scoped
- `createLead(payload)` — admin/manager+; assignee must be in scope
- `updateLead(id, patch)` — admin/manager+ within scope
- `updateLeadStage(id, stage, {note?})` — admin/manager/assigned-staff; atomically writes system `lead_visit`
- `assignLead(id, employee_id)` — admin/manager+ within scope; fires `lead-assigned` email via `waitUntil`
- `bulkAssignLeads(ids[], employee_id)` — admin only
- `deleteLead(id)` — admin only (cascades visits)

### `src/actions/geo-visits.ts`
- `listLeadVisits(lead_id)` — scope follows parent lead
- `createLeadVisit({lead_id, notes, outcome, follow_up_date?, lat?, lng?})` — admin/manager OR assigned staff; auto-updates `leads.stage` if `outcome ∈ {converted, lost}`
- `updateLeadVisit(id, patch)` — author + admin only
- `deleteLeadVisit(id)` — admin only. Server rejects when `system = true` (kanban-drag stage-transition rows are immutable audit).

### `src/actions/geo-sessions.ts` (Phase 1 read-only)
- `listActiveSessions()` — role-scoped; returns `[{session_id, employee_name, started_at, last_ping_at, last_lat, last_lng}]`. Empty in Phase 1.
- `listSessionPings(session_id)` — admin/manager within scope.
- Phase 2 stubs: `startSession`, `endSession`, `ingestPings` (export as `TODO(PRD 04)`).

### `src/actions/geo-consents.ts` (Phase 1 read-only)
- `listConsents()` — admin only.
- Phase 2: `recordConsent`, `revokeConsent` (mobile).

### `src/actions/geo-reports.ts`
- `getLeadFunnel({from?, to?})` — admin/manager; stage counts within scope
- `getOverdueFollowUps()` — admin/manager within scope
- `getMyAssignedLeads()` — staff self-view

### Settings extension
- `updateJambaGeoSettings({enabled, default_retention_days?, default_ping_interval_min?})` — admin only; writes `organizations.settings.jambageo` JSONB.

### Email surface (Phase 1)
- `src/components/emails/lead-assigned.tsx` — sender `FROM_EMAIL` (existing constant from `src/lib/resend.ts`). Subject: "{adminName} assigned you a new lead: {leadName}". Body: lead details + deep-link. Best-effort via `waitUntil`.

---

## 5. Web UI

### Sidebar
New entry "JambaGeo" in `src/config/navigation.ts` — icon `MapPin` (lucide-react). Compound feature flag `hasFeature(plan, "jambageo") && jambaGeoEnabled`. Sub-items: Leads / Geofences / Live Map / Reports.

### Page tree (`src/app/dashboard/geo/`)

| Route | Audience | Content |
|---|---|---|
| `layout.tsx` | All authed (gates inside) | `requireJambaGeoAccess()` + top tab nav |
| `page.tsx` | All | `redirect("/dashboard/geo/leads")` |
| `leads/page.tsx` | Admin/manager (scoped) | Default kanban, 6 columns + toggle to list view via `?view=list` |
| `leads/[id]/page.tsx` | Admin/manager/assigned staff | Lead detail: left = editable info; right = visit timeline + "Log visit" |
| `geofences/page.tsx` | All read; admin writes | Left: list with active toggle; right: Mapbox map + draw controls |
| `live-map/page.tsx` | Manager+ | Mapbox map. **Phase 1 empty state**: "No active sessions yet. Field staff will appear here when they check in via the JambaGeo mobile app (coming soon)." |
| `reports/page.tsx` | Manager+ | Funnel chart (Recharts), overdue follow-ups, per-staff conversion stats |
| `my-leads/page.tsx` | Any role with assigned leads | Staff self-view: table only, no kanban |

### Components (`src/components/geo/`)
`geo-nav`, `leads-kanban`, `lead-card`, `leads-list`, `lead-dialog`, `lead-detail`, `visit-timeline`, `log-visit-dialog`, `geofence-map`, `geofence-list`, `live-map`, `funnel-chart`, `overdue-followups`.

### Settings section
`src/components/settings/jambageo-section.tsx` — CollapsibleSection, admin-only render. Master toggle, default consent retention (1–365 days, default 90), default ping interval (5–60 min, default 15), link to `/dashboard/geo/geofences`.

### Mapbox setup
- `NEXT_PUBLIC_MAPBOX_TOKEN` env var, URL-restricted in Mapbox console.
- `src/lib/mapbox.ts` — `getMapboxToken()`, `DEFAULT_INDIA_VIEWPORT = { latitude: 20.5937, longitude: 78.9629, zoom: 4 }`.
- Deps: `react-map-gl`, `mapbox-gl`, `@mapbox/mapbox-gl-draw`.
- All map components loaded via `dynamic(() => import('...'), { ssr: false })`.

### AI Assistant integration (gotcha #61 — MANDATORY)
- New `ROUTE_REGISTRY` entries in `src/lib/assistant/route-registry.ts` for every new dashboard page.
- 7 help articles in `src/lib/assistant/help/articles/`: `geo_overview.md`, `geo_create_lead.md`, `geo_assign_lead.md`, `geo_log_visit.md`, `geo_kanban_drag.md`, `geo_geofences.md`, `geo_reports.md`.
- `npm run embed:help` after authoring (gotcha #64).

---

## 6. Permissions Matrix

Read scope:

| Role | Leads | Visits | Geofences | Sessions/Pings | Consents | Reports |
|---|---|---|---|---|---|---|
| owner/admin | all | all | all | all | all | all |
| manager | dept-scoped + unassigned pool | parent-lead scope | read all | dept-scoped | none | dept-scoped |
| employee | `assigned_to = me` | own leads | read all | own only | own only | own assigned |

Write scope:

| Action | owner/admin | manager | assigned employee |
|---|---|---|---|
| createLead | ✅ any assignee | ✅ assignee ∈ own dept or NULL | ❌ |
| updateLead | ✅ all | ✅ within scope; reassign ∈ own dept | ❌ |
| updateLeadStage | ✅ | ✅ within scope | ✅ own lead only |
| createLeadVisit | ✅ | ✅ within scope | ✅ own lead only |
| assignLead / bulkAssign | ✅ | ✅ within scope | ❌ |
| deleteLead / deleteLeadVisit | ✅ admin only | ❌ | ❌ |
| createGeofence / update / toggle / delete | ✅ admin only | ❌ | ❌ |
| updateJambaGeoSettings | ✅ admin only | ❌ | ❌ |

Edge cases handled: cross-dept reassignment rejected, unassigned leads visible to manager, demoted manager loses scope immediately (no cache), terminated assignee shows amber chip on card, org-toggle off mid-session redirects on next nav.

---

## 7. Error Handling, Crons, Demo Data

### Failure modes
- **Mapbox token missing/quota:** map components catch and render fallback placeholder; numeric lat/lng/radius inputs remain usable. Sentry breadcrumb on 429.
- **Validation:** Zod on every action — lat ∈ [-90,90], lng ∈ [-180,180], radius 1–5000m, `value_inr` ≥ 0 capped at 1 crore, `follow_up_date` ≥ today on create.
- **Kanban race:** optimistic client update + idempotent `updateLeadStage` server-side. System `lead_visit` written only when previous stage differs.
- **Email failures:** `lead-assigned` via `waitUntil` — never blocks. Sentry breadcrumb on failure.
- **Demoted manager:** scope re-resolved per request, no cache.
- **Terminated assignee:** amber "Reassign — assignee inactive" chip in UI; admin reassigns.
- **Org toggle off mid-session:** `requireJambaGeoAccess` re-evaluates per request; sidebar disappears, direct nav redirects.

### Crons (`vercel.json` + `src/app/api/cron/`)

| Route | Schedule (UTC / IST) | Purpose | Phase |
|---|---|---|---|
| `/api/cron/jambageo-followup-reminders` | `30 3 * * *` / 9:00am IST | Email staff with `leads.follow_up_date = today AND assigned_to IS NOT NULL` | Phase 1 |
| `/api/cron/jambageo-retention-sweep` | `0 19 * * *` / 12:30am IST | Delete `location_pings` older than retention window. Join path: `location_pings → duty_sessions → employees → geo_consents`. Per-employee `geo_consents.retention_days` if present; otherwise fall back to `organizations.settings.jambageo.default_retention_days` (default 90). **Phase 1: literal no-op** because no pings exist yet — wiring it now means DPDP retention is enforced the moment mobile starts writing in Phase 2. | Phase 1 |
| `/api/cron/jambageo-auto-end-sessions` | (deferred) | Force-close stuck `duty_sessions` after 12h. | Phase 2 |

All require `Bearer ${CRON_SECRET}`; exempt from Clerk via existing `/api/cron(.*)` public matcher.

### DPDP posture (Phase 1)
- No location data collected yet.
- Privacy notice rendered on `/dashboard/geo/geofences`: "Field staff location data is collected only on consent via the JambaGeo mobile app. No web admin can enable tracking without staff opt-in."
- Retention sweep ready from day one.

### Demo seed (`scripts/seed-jambageo-demo.sql`)
- 4 geofences for `test1` org (office + 3 client sites in Mumbai/Pune/Delhi).
- 12 leads across all 6 stages; assignees in Sales + Marketing depts.
- 6 sample `lead_visits` with outcome variety.
- No `duty_sessions` / `location_pings` (no mobile yet).
- Idempotent via `INSERT ... ON CONFLICT DO NOTHING` on natural keys.

---

## 8. Testing

Vitest only — matches existing test infra. No Playwright.

| Layer | File |
|---|---|
| Geometry: `haversine`, `isPointInGeofence`, `mapStageToOutcome`, `formatGeofenceRadius` | `tests/geo/geometry.test.ts` |
| Stage transitions: idempotent + writes `lead_visit` only on actual change | `tests/geo/stage-transitions.test.ts` |
| Manager scope: list filter, cross-dept rejection, unassigned pool visibility | `tests/geo/manager-scope.test.ts` |
| Validation: Zod schemas on bad lat/lng/radius/value/follow_up_date | `tests/geo/validation.test.ts` |
| AI assistant integrity (auto-flagged): registry + article presence | existing `tests/assistant/route-registry.integrity.test.ts` |
| Help-loader contract | existing `tests/assistant/help-loader.test.ts` |

### Lint
Existing `eslint-rules/no-orphan-dashboard-route.js` (gotcha #65) catches missing route-registry entries on `npm run lint`.

### Type safety
Manual updates to `src/types/database.types.ts` (Supabase CLI doesn't run on Windows — gotcha #4). Six new table types + RLS-friendly Row/Insert/Update shapes.

### Manual verification checklist (executed in implementation plan)
1. Admin creates geofence on map → persists → list reflects → toggle inactive greys it out.
2. Admin creates lead → assigns to staff → staff receives email → staff sees in `my-leads`.
3. Manager attempts cross-dept assignment → red toast, server rejects.
4. Manager drags lead `new → contacted` → kanban updates, `lead_visits` system row written.
5. Employee logs visit with `outcome=converted` → lead stage flips to `converted`, kanban reflects.
6. Live map page: empty state renders correctly, no Mapbox console errors.
7. Settings: toggle JambaGeo off → sidebar entry disappears, direct nav redirects.
8. Plan downgrade Business → Growth: JambaGeo blocked.

---

## 9. Phasing

### Phase 1 (this spec)
- Migrations 051–057
- Server actions: geo-leads / geo-geofences / geo-visits / geo-sessions (read-only) / geo-consents (read-only) / geo-reports
- Web UI: `/dashboard/geo/` route group — leads kanban + list, lead detail, geofence map editor, live-map empty state, reports, my-leads
- Settings → JambaGeo section
- `lead-assigned` Resend template
- 2 crons: follow-up reminders + retention sweep
- AI assistant route registry + 7 help articles + re-embed
- Demo seed for `test1` org
- Mapbox token env var

### Phase 2 (after PRD 04 mobile lands)
- Expo app with consent flow, check-in/out, GPS ping loop, offline queue, push notifications
- Wire `startSession` / `endSession` / `ingestPings` / `recordConsent` / `revokeConsent`
- Photo proof on visits (Supabase Storage `geo-visit-photos`)
- Auto-end-sessions cron
- Real live-map (real pings; 30s polling already in client code)
- Geofence auto check-in assist

### Phase 3+
- PostGIS for heatmap reports
- Per-org configurable lead stages
- External CRM integration (Zoho / HubSpot push)
- Route insights, advanced analytics
- Lead-stage audit table (if customer demand)

---

## 10. Open Items (carried from PRD)

- **D1 (maps provider)** — **resolved: Mapbox**.
- **A1 (ping interval default)** — confirmed 15 min for Phase 2 default in `geo_consents` / org settings.
- **A2 (CRM stays lightweight)** — confirmed; no quotations/invoicing.
- **A3 (location retention default)** — confirmed 90 days; configurable 1–365.

---

## Appendix A — File manifest (new files only)

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
  geo/geometry.ts
  geo/stages.ts
  mapbox.ts

src/components/geo/
  geo-nav.tsx, leads-kanban.tsx, lead-card.tsx, leads-list.tsx
  lead-dialog.tsx, lead-detail.tsx, visit-timeline.tsx, log-visit-dialog.tsx
  geofence-map.tsx, geofence-list.tsx, live-map.tsx
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
  geometry.test.ts, stage-transitions.test.ts
  manager-scope.test.ts, validation.test.ts
```

## Appendix B — Modified files (edits to existing)

```
src/config/plans.ts                       (+ jambageo feature flag)
src/config/navigation.ts                  (+ JambaGeo sidebar entry)
src/lib/current-user.ts                   (+ jambaGeoEnabled)
src/lib/assistant/route-registry.ts       (+ entries for every new geo page)
src/components/settings/settings-content.tsx (+ jambageo-section render slot)
src/actions/settings.ts                   (+ updateJambaGeoSettings)
src/types/database.types.ts               (+ 6 table types)
src/types/index.ts                        (+ Lead, LeadVisit, Geofence, DutySession types)
vercel.json                               (+ 2 cron entries)
package.json                              (+ react-map-gl, mapbox-gl, @mapbox/mapbox-gl-draw deps)
next.config.js                            (potentially + mapbox-gl in serverComponentsExternalPackages — verify at impl time)
CLAUDE.md                                 (+ JambaGeo module section after merge)
```
