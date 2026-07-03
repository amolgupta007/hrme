# Cross-Org Attendance for Company Groups (TMP) — Implementation Plan

> **Status:** Approved design, pending final go-ahead on the PIN-33 data question. No implementation code until explicitly approved.
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** When an employee on the payroll of Org A punches at a biometric device belonging to Org B, and both orgs are in the same declared company group, attribute the punch to Org A's attendance/payroll exactly as if it happened at home — while Org B sees a read-only "guest punch" audit entry that never affects Org B's attendance or payroll.

**Concrete v1 target:** the **TMP** group = **TMP Wagholi** (Org A) + **TMP Boat Club** (Org B), two separate JambaHR organizations, same employer. Scalable to other groups with no code change. Their devices are live and punching; **no PIN changes are made** — resolution uses existing `employees.device_code` across the group. PIN ranges are **unique across the group**: Boat Club **10–32**, Wagholi **33–56** (confirmed 2026-07-03 — no overlap, no dual-assigned PIN), so host-match-first can never misattribute and the group-canonical-PIN model holds with zero re-enrollment.

**Architecture:** A new group concept (`company_groups` + `org_group_memberships`, superadmin-managed) plus a resolution step inserted at the exact point in `ingestAttlog` where a host-org PIN miss is silently dropped today. On a host miss, ingest searches sibling group orgs for the PIN, and on a single match writes the punch into the **payroll org's** `attendance_punch_events` (service-role, gated by a verified group-membership assertion) and a **guest-punch audit row** in the host org. Downstream payroll/OT/late-penalty need **zero changes** — they already read `attendance_records` by `org_id`, so landing the punch in the right org is the whole job.

**Tech stack:** Next.js 14 App Router (server actions), TypeScript strict, Supabase Postgres (migrations via Supabase MCP — idempotent), Vitest, existing ADMS ingest pipeline.

---

## Global Constraints

- **Do NOT disturb live PINs.** No re-enrollment, no PIN reassignment on TMP devices. Resolution matches existing `device_code` values across the group.
- **Do not weaken RLS globally.** Cross-org writes go through the existing service-role path (which already bypasses RLS, gotcha #5) but are gated by an explicit application-level assertion that both the host org and the payroll org are members of the **same** group. This mirrors the Insights cross-org security precedent (`resolveScopedOrgIds`).
- **No Clerk org changes.** Grouping is a JambaHR-level concept on top of existing orgs. (The prompt's "Clerk Orgs → RLS via JWT" premise is stale; tenancy is Supabase `employees` + cookie.)
- **Group management is superadmin-only for v1** (`/superadmin`, `SUPERADMIN_SECRET`-gated). Two unrelated tenants can never be grouped by a customer action.
- **Ambiguity is flagged, never guessed.** A PIN that matches >1 group employee → `unresolved_punches` review row, no attribution.
- **Host-org isolation:** guest punches live in a separate table read by NO attendance/payroll/OT code — structurally impossible to leak into the host's numbers.
- All-India IST. Money/dates unchanged. Next migration numbers are **091, 092** (repo is at 090).
- Idempotent migrations (`IF NOT EXISTS`). Service-role client for all writes. `ActionResult<T>` + `isSuperadminAuthenticated()` guards. No `Co-Authored-By` in commits. Branch off `main`.

---

## Data question — RESOLVED

PIN ranges are **unique across the TMP group**: Boat Club **10–32**, Wagholi **33–56** (confirmed 2026-07-03). No dual-assigned PIN, so no misattribution risk. Task 8's collision scan is retained as an ongoing safety net for future group members, but no PIN 33 conflict exists today.

---

## File Structure

- `src/lib/attendance/cross-org-resolution.ts` (new) — pure attribution decision function.
- `src/lib/attendance/company-group.ts` (new) — DB helpers: resolve an org's group + sibling org ids (non-`"use server"` so ingest + actions can import).
- `src/lib/attendance/adms-ingest.ts` (modify) — insert cross-org resolution at the host-miss branch; write cross-org punch + guest log + unresolved rows.
- `src/lib/attendance/resolve-zone.ts` (modify) — union group-member locations so a zoned employee's guest punches aren't dropped as out-of-zone.
- `src/actions/company-groups.ts` (new) — superadmin CRUD: create group, add/remove org, collision scan.
- `src/actions/guest-punches.ts` (new) — host-org read of guest punches (admin, own org).
- `src/app/superadmin/groups/page.tsx` + `src/components/superadmin/groups/*` (new) — group management UI.
- `src/components/attendance/guest-punches-card.tsx` (new) — host-org "Guest punches" panel on the attendance Locations tab.
- `scripts/seed-tmp-group.sql` (new) — idempotent TMP group seed.
- `src/lib/attendance/simulate-adms-punch.ts` (new, dev-only) — fire a signed sister-org punch through the live ingest path.
- Migrations: `091_company_groups.sql`, `092_guest_and_unresolved_punches.sql`.

---

## Task 1: Migration 091 — company groups

**Files:** Create `supabase/migrations/091_company_groups.sql`

**Produces:** `company_groups(id, name, created_by, created_at)` and `org_group_memberships(id, group_id, org_id UNIQUE, joined_at)` — UNIQUE(org_id) enforces one group per org in v1.

- [ ] **Step 1: Write the SQL**

```sql
-- 091_company_groups.sql — JambaHR-level grouping of organizations (superadmin-managed)
CREATE TABLE IF NOT EXISTS public.company_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by text NULL,               -- superadmin identifier (no employees FK; platform-level)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.org_group_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.company_groups(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_one_group UNIQUE (org_id)  -- an org is in at most one group (v1)
);
CREATE INDEX IF NOT EXISTS idx_org_group_memberships_group ON public.org_group_memberships (group_id);

-- RLS: these are platform-level tables written only by the service-role superadmin path.
ALTER TABLE public.company_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_group_memberships ENABLE ROW LEVEL SECURITY;
-- No authenticated policies: no tenant JWT should read/write group wiring directly.
-- Service-role (superadmin actions) bypasses RLS by design (gotcha #5).
```

- [ ] **Step 2:** Apply via Supabase MCP (name `091_company_groups`), verify with `list_tables`.
- [ ] **Step 3:** Commit.

---

## Task 2: Migration 092 — guest + unresolved punch logs

**Files:** Create `supabase/migrations/092_guest_and_unresolved_punches.sql`

**Produces:** `guest_punch_logs` (host-org audit of a group employee's punch) and `unresolved_punches` (ambiguous/collision review queue).

- [ ] **Step 1: Write the SQL**

```sql
-- 092_guest_and_unresolved_punches.sql
-- Host-org visibility log for cross-org (group) punches + ambiguity review queue.

CREATE TABLE IF NOT EXISTS public.guest_punch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,   -- where the device is
  guest_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,  -- payroll org
  guest_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  device_id uuid NULL REFERENCES public.devices(id) ON DELETE SET NULL,
  location_id uuid NULL REFERENCES public.locations(id) ON DELETE SET NULL,
  punched_at timestamptz NOT NULL,
  punch_event_id uuid NULL REFERENCES public.attendance_punch_events(id) ON DELETE SET NULL,
  pin text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guest_punch_logs_host ON public.guest_punch_logs (host_org_id, punched_at);

CREATE TABLE IF NOT EXISTS public.unresolved_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id uuid NULL REFERENCES public.devices(id) ON DELETE SET NULL,
  pin text NOT NULL,
  punched_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (reason IN ('ambiguous_group_pin','no_group_match')),
  candidate_org_ids uuid[] NULL,      -- orgs that matched on ambiguity
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unresolved_punches_host ON public.unresolved_punches (host_org_id, resolved, punched_at);

-- guest_punch_logs is host-org readable (admins) for audit; unresolved is superadmin-triage.
ALTER TABLE public.guest_punch_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS guest_punch_logs_host_admin ON public.guest_punch_logs;
CREATE POLICY guest_punch_logs_host_admin ON public.guest_punch_logs
  FOR SELECT TO authenticated
  USING (host_org_id::text = auth.jwt() ->> 'org_id'
    AND auth.jwt() ->> 'org_role' IN ('org:owner','org:admin'));
ALTER TABLE public.unresolved_punches ENABLE ROW LEVEL SECURITY;  -- superadmin/service-role only; no authed policy
```

- [ ] **Step 2:** Apply via Supabase MCP (name `092_guest_and_unresolved_punches`).
- [ ] **Step 3:** Commit.

---

## Task 3: Pure cross-org attribution decision (TDD)

**Files:** Create `src/lib/attendance/cross-org-resolution.ts` · Test `tests/attendance/cross-org-resolution.test.ts`

**Interfaces:**
```ts
export type GroupMatch = { employeeId: string; orgId: string };
export type Attribution =
  | { status: "host"; employeeId: string; orgId: string }
  | { status: "attributed"; employeeId: string; payrollOrgId: string }
  | { status: "ambiguous"; candidateOrgIds: string[] }
  | { status: "unmatched" };
// hostMatch = the employee in the device's own org for this PIN (or null).
// groupMatches = non-terminated employees in SIBLING group orgs with this device_code.
export function decideAttribution(
  hostMatch: { employeeId: string; orgId: string } | null,
  groupMatches: GroupMatch[],
): Attribution;
```

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { decideAttribution } from "@/lib/attendance/cross-org-resolution";

describe("decideAttribution", () => {
  it("host match wins (dual-employment safe)", () => {
    expect(decideAttribution({ employeeId: "H", orgId: "B" }, [{ employeeId: "G", orgId: "A" }]))
      .toEqual({ status: "host", employeeId: "H", orgId: "B" });
  });
  it("single group match → attributed to payroll org", () => {
    expect(decideAttribution(null, [{ employeeId: "G", orgId: "A" }]))
      .toEqual({ status: "attributed", employeeId: "G", payrollOrgId: "A" });
  });
  it("multiple group matches → ambiguous, never guess", () => {
    const r = decideAttribution(null, [{ employeeId: "G1", orgId: "A" }, { employeeId: "G2", orgId: "C" }]);
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") expect(r.candidateOrgIds.sort()).toEqual(["A", "C"]);
  });
  it("no match → unmatched", () => {
    expect(decideAttribution(null, [])).toEqual({ status: "unmatched" });
  });
});
```

- [ ] **Step 2:** Run → fails (module missing).
- [ ] **Step 3: Implement**

```ts
// src/lib/attendance/cross-org-resolution.ts
export type GroupMatch = { employeeId: string; orgId: string };
export type Attribution =
  | { status: "host"; employeeId: string; orgId: string }
  | { status: "attributed"; employeeId: string; payrollOrgId: string }
  | { status: "ambiguous"; candidateOrgIds: string[] }
  | { status: "unmatched" };

export function decideAttribution(
  hostMatch: { employeeId: string; orgId: string } | null,
  groupMatches: GroupMatch[],
): Attribution {
  if (hostMatch) return { status: "host", employeeId: hostMatch.employeeId, orgId: hostMatch.orgId };
  if (groupMatches.length === 1) {
    return { status: "attributed", employeeId: groupMatches[0].employeeId, payrollOrgId: groupMatches[0].orgId };
  }
  if (groupMatches.length > 1) {
    return { status: "ambiguous", candidateOrgIds: [...new Set(groupMatches.map((m) => m.orgId))] };
  }
  return { status: "unmatched" };
}
```

- [ ] **Step 4:** Run → passes. **Step 5:** Commit.

---

## Task 4: Company-group DB helpers

**Files:** Create `src/lib/attendance/company-group.ts` (plain module, NOT `"use server"`)

**Interfaces:**
```ts
// Returns the group id for an org, or null if ungrouped.
export async function getOrgGroupId(sb, orgId: string): Promise<string | null>;
// Returns sibling org ids in the same group (excluding the given org), [] if ungrouped.
export async function getSiblingOrgIds(sb, orgId: string): Promise<string[]>;
// Assert both orgs share a group — the cross-org write gate.
export async function assertSameGroup(sb, orgA: string, orgB: string): Promise<boolean>;
// All location ids owned by the org's group members (for zone union).
export async function getGroupLocationIds(sb, orgId: string): Promise<string[]>;
```

- [ ] **Step 1:** Implement each with `org_group_memberships` / `locations` queries (service-role client passed in). `assertSameGroup` returns true only when both orgs resolve to the same non-null `group_id`.
- [ ] **Step 2:** Build check (`npm run build`). **Step 3:** Commit.

*(No dedicated unit test — pure DB glue; covered by the ingest integration + simulate script in Task 9.)*

---

## Task 5: Ingest integration — resolve host-miss PINs across the group

**Files:** Modify `src/lib/attendance/adms-ingest.ts` (`ingestAttlog`, the `unmatched` branch ~150-158 and insert ~163-171)

**Interfaces:** Consumes `decideAttribution` (T3), `getSiblingOrgIds`/`assertSameGroup` (T4), `recomputeAttendanceDay`.

- [ ] **Step 1:** After building the host-org `pinToEmp` map, collect the host-miss PINs. If the device's org has a group (`getSiblingOrgIds(orgId)` non-empty), query sibling orgs for non-terminated employees with `device_code IN (missPins)` → build `groupMatchesByPin: Map<pin, GroupMatch[]>`.
- [ ] **Step 2:** In the per-punch loop, replace the bare `unmatched.add(pin); continue;` with:
  - host match → existing insert (org = device org). *(unchanged behaviour)*
  - else `decideAttribution(null, groupMatchesByPin.get(pin) ?? [])`:
    - `attributed` → **assert `assertSameGroup(payrollOrgId, deviceOrgId)`** (defensive), insert `attendance_punch_events` with `org_id = payrollOrgId, employee_id, device_id = host device, location_id = host location, source = 'adms'`; capture the inserted id; write a `guest_punch_logs` row in the host org (host_org_id = device org, guest_org_id = payrollOrgId, punch_event_id); mark the `(payrollOrgId|employeeId|istDate)` pair affected so recompute runs against the **payroll org**.
    - `ambiguous` → insert `unresolved_punches` (`reason='ambiguous_group_pin'`, `candidate_org_ids`), no attribution.
    - `unmatched` → as today (in-memory only; optionally also `unresolved_punches` with `reason='no_group_match'` — recommended so guest arrivals are visible).
- [ ] **Step 3:** Recompute loop already iterates affected `(org,employee,istDate)`; ensure cross-org affected pairs use the **payroll** org id (they do, since we key by payrollOrgId). All writes best-effort/logged, never throw (device must still get `OK`).
- [ ] **Step 4:** `npm test -- tests/attendance/` (no regressions to existing parser tests). **Step 5:** Commit.

---

## Task 6: Zone union so guest punches aren't dropped as out-of-zone

**Files:** Modify `src/lib/attendance/resolve-zone.ts` · Test `tests/attendance/resolve-zone-group.test.ts` (if a pure seam exists) else covered by Task 9.

**Interfaces:** `resolveEmployeeZoneLocationIds` gains group-awareness: when the employee's org is in a group, **union the group's location ids** into the returned set (so a payroll-org employee's punch at a sister location is in-zone). Null (no-zone fallback) is unchanged — it already pools all of the employee's own-org events; the union only matters when the employee HAS a zone assignment.

- [ ] **Step 1:** After resolving the assignment's zone location ids, if non-null, `union getGroupLocationIds(orgId)` (T4). Keep the null-fallback path as-is.
- [ ] **Step 2:** Add a focused test if the location-union logic can be extracted to a pure helper (`unionGroupLocations(zoneIds, groupIds)`); otherwise rely on Task 9's end-to-end simulate.
- [ ] **Step 3:** Build. **Step 4:** Commit.

---

## Task 7: Host-org guest-punch visibility (read + UI)

**Files:** Create `src/actions/guest-punches.ts` (`listGuestPunches({from,to})`, admin + own org) · Create `src/components/attendance/guest-punches-card.tsx` · Modify the attendance Locations tab to render it.

- [ ] **Step 1:** `listGuestPunches` — `getCurrentUser` + `isAdmin`, reads `guest_punch_logs` `.eq("host_org_id", user.orgId)` joined to guest org name + employee name, date-filtered.
- [ ] **Step 2:** `GuestPunchesCard` — a panel on the admin Locations tab: "Guest punches (group companies)" listing time · guest employee · guest company · location, clearly labelled "not counted in your attendance/payroll."
- [ ] **Step 3:** Build. **Step 4:** Commit.

---

## Task 8: Superadmin group management + collision scan

**Files:** Create `src/actions/company-groups.ts` · `src/app/superadmin/groups/page.tsx` · `src/components/superadmin/groups/*`

**Interfaces (all `isSuperadminAuthenticated()`-gated):** `listGroups()`, `createGroup(name)`, `addOrgToGroup(groupId, orgId)`, `removeOrgFromGroup(orgId)`, `scanGroupPinCollisions(groupId)` → returns PINs assigned in >1 member org (surfaces **PIN 33**).

- [ ] **Step 1:** Implement actions. `addOrgToGroup` enforces `uq_org_one_group` (friendly error if the org is already grouped) and **runs `scanGroupPinCollisions` as a warning** (does not hard-block, but surfaces collisions so they're resolved operationally).
- [ ] **Step 2:** Superadmin page: list groups + members, create group, add/remove org (org picker), and a **collision report** panel per group.
- [ ] **Step 3:** Build. **Step 4:** Commit.

---

## Task 9: TMP seed + simulate script + end-to-end verification

**Files:** Create `scripts/seed-tmp-group.sql` · `src/lib/attendance/simulate-adms-punch.ts` (dev-only)

- [ ] **Step 1:** `seed-tmp-group.sql` — idempotent: create `company_groups('TMP')`, add the Wagholi + Boat Club org ids (parameterised — fill real ids). Include the collision scan query as a comment to run first.
- [ ] **Step 2:** `simulateAdmsPunch({ serial, pin, localDateTime })` — builds a real ATTLOG body and calls the ingest path (sandbox/dev only), so a Wagholi PIN can be fired at the Boat Club serial without a physical device.
- [ ] **Step 3:** Manual verification script (documented in the plan / a `docs/` note):
  1. Seed TMP group.
  2. Simulate a Wagholi employee (e.g. PIN 45) punching **in** at the Boat Club device, then **out** later at the Wagholi device.
  3. Assert: one `attendance_records` row in **Wagholi** for that employee/day with both punches paired (worked = out−in, break excluded); a `guest_punch_logs` row in **Boat Club**; **nothing** added to Boat Club attendance/payroll.
  4. Simulate PIN 33 (if dual-assigned) → assert it lands in `unresolved_punches`, not attributed.
- [ ] **Step 4:** Commit seed + simulate. **Step 5:** Final: `npm test`, `npm run build`, `npm run lint` (new files clean).

---

## Rollout

1. Apply migrations 091, 092.
2. Superadmin: create the **TMP** group, add Wagholi + Boat Club, run the collision scan, resolve PIN 33 if needed.
3. Deploy. No feature flag needed — behaviour only activates for orgs that are group members; all other tenants are unaffected (ungrouped → `getSiblingOrgIds` returns `[]` → existing drop behaviour, zero change).
4. Watch `unresolved_punches` for the first days to catch unexpected PIN misses.

## Scope / deferred
- **v1:** ADMS/biometric path only (the app/web punch is same-session, no cross-org case).
- **Deferred (Phase 3):** customer-admin group management with two-org handshake; extending ADMS user-provisioning (migration 085) to auto-enroll group employees on group devices with a canonical PIN; per-group enable/disable toggle; group-wide hard `device_code` uniqueness constraint (v1 uses a soft collision scan to avoid breaking live data).

## Self-review (spec coverage)
Group modeling → T1/T8 (superadmin-only). Cross-org resolution + order + ambiguity + security gate → T3/T4/T5. Host visibility log → T2/T7. Zone/pairing interaction → T6 (+ existing `pairPunches`). Edge cases (terminated/dual-employment/dedupe/collision/timezone) → T3 host-first + T5 status-filter + existing org-scoped dedupe + T8 collision scan. Migration & rollout & test plan → T1/T2/T9. Prompt's stale Clerk-RLS premise → reconciled in Global Constraints.
