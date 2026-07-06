# 02A — Phase D (Staff MVP) Implementation Decisions

**Status:** Investigated + planned 2026-07-06. Slice 1 plan approved-in-principle; **execution awaiting explicit go-ahead from Amol** (a UI/design exploration task runs first).
**Slice 1 task plan:** `docs/superpowers/plans/2026-07-06-mobile-phase-d-slice1-attendance-home.md`
**Parent specs:** `02-PRD-Staff-MVP.md`, `PRD-addendum-mobile-data-layer.md` (binding), `01A-MIGRATION-PLAN.md` §5.2.

This file is the durable record of what the 2026-07-06 investigation of `apps/web`
found and what was DECIDED. Read it before implementing any Phase D slice.

---

## Slicing (chosen by Amol, 2026-07-06)

| Slice | Scope | Status |
|---|---|---|
| **D1** | Data foundation (TanStack Query + MMKV), `/api/mobile/home` + `/attendance` + punch endpoint, Home screen, attendance month calendar, offline punch queue, regularization v1 (droppable to D2), first EAS Android dev build | Planned (see slice-1 plan doc) |
| **D2** | Leave (balances/apply/cancel **including half-day** — schema supports 0.5, no web UI produces it; mobile is first), Payslips (native render on shared payroll math; PDF deferred), Profile self-edit + emergency contact, web side-fixes (below) | Not yet planned in detail |
| **D3** | Push notifications (needs its own PRD — no in-app notification feed/table exists), FlashList/expo-image performance sweep, payslip PDF via the documents `@react-pdf/renderer` pipeline, account-deletion entry (PRD-05) | Backlog |

## Locked decisions

1. **Punch write path = event stream, never direct-write** (01A §5.2). Mobile inserts
   `attendance_punch_events` (`source:'mobile'`) then `recomputeAttendanceDay`.
   Rationale: web `clockIn` writes `attendance_records` directly and *contends* with
   the ADMS rollup upsert on `(org_id,employee_id,date)` — last writer clobbers.
   Mobile must coexist with biometric punches, so it joins their stream. (The web
   direct-write bug itself is a separate, not-yet-scheduled web fix.)
2. **Idempotency via client-generated UUID**: new `attendance_punch_events.client_event_id`
   + partial unique index. Offline replays return success on conflict. (The existing
   `uq_punch_events_dedupe` on punched_at remains as backstop.)
3. **Mobile GPS punches bypass attendance-zone filtering** (lenient): `PunchEvent`
   gains `source`; `computeDailyAttendance` zone-exclusion exempts `'mobile'`.
   Field staff punching at client sites are not "out of zone". Optional lat/lng
   columns added now; capture stays org-flag-gated (DPDP consent copy required).
4. **Month calendar = new pure function in `packages/shared`** (`computeMonthCalendar`):
   nothing on web merges attendance + holidays + effective week-off + approved
   leaves into day states today. Precedence: holiday > leave > week-off >
   attendance-derived > absent > future. Built shared so web can adopt it later.
5. **Leave balances are DERIVED, not read from `leave_balances`**: that table has no
   write path anywhere in web — truth = sum of approved request `days` per policy per
   calendar year (`listLeavePolicies`/`listEmployeeBalances` logic). Mobile replicates
   the aggregation.
6. **Regularization v1 = pending punch events**, no new table: employee submits
   proposed in/out + reason → 1–2 `attendance_punch_events` rows `status:'pending'`
   (086 lifecycle columns) → approved through the existing web manager punch-review
   flow. Manager mobile UX deliberately deferred.
7. **All data through composed BFF endpoints** — one endpoint per screen
   (`/api/mobile/home`, `/api/mobile/attendance?month=`, `/api/mobile/payslips`),
   DTOs in `packages/shared/src/mobile/`, copying the `/api/mobile/me` pattern
   (thin route + pure payload builder + tests, `x-org-id` hint validated server-side).
   PRD-02's older "Supabase + RLS from the client" language is SUPERSEDED (no
   Clerk-JWT→RLS path exists; BFF is the boundary).
8. **Data layer per addendum**: TanStack Query + MMKV persistence (cache keyed per
   user+org, wiped on sign-out/org-switch), optimistic punch/leave mutations,
   MMKV offline punch queue drained on reconnect/foreground. **MMKV + FlashList
   require a dev build** — Expo Go path feature-detects and falls back to in-memory.
   First **EAS Android development build** closes slice D1 (no Apple account needed;
   Expo Go on iOS is frozen at SDK 54 anyway).
9. **Migrations required (D1)**: widen `attendance_punch_events.source` CHECK with
   `'mobile'`; widen `attendance_records.source` CHECK with `'mobile'` (constraint
   is NOT in tracked migrations — confirm live name via `pg_constraint` first);
   add `client_event_id` + lat/lng. Rollup stamps `source:'mobile'` for mobile-only
   days, `'device'` when any device event exists.

## Web bugs/gaps found during investigation (fix candidates, mostly D2)

- `cancelLeave` has **no ownership check** (`leaves.ts:406-423`) — any org member can
  cancel any pending request by id. Mobile BFF enforces ownership; web should too.
- Dashboard `myLeaveBalances` widget reads the stale `leave_balances` table
  (`dashboard.ts:327-332`) → likely wrong numbers. Switch to aggregation.
- `requestLeave` has no server-side overlap/balance validation (client-trusted).
  Mobile BFF adds validation; consider backporting to web.
- Web `clockIn` vs ADMS rollup same-day contention (last-writer-wins) — unify web
  onto the event stream eventually.
- Payslip email data-assembly is inlined in `sendPayrollEmail` loop — extract
  `buildPayslipData(entryId)` when D2 payslips land.

## Key reuse map (what already exists)

- `getTodayStatus()` (`attendance.ts:226-249`) — Home punch-state card query shape.
- Shared pure attendance helpers (all in `packages/shared/src/attendance/`):
  `attributedDateForClockIn`, `pairPunches`, `computeDailyAttendance`,
  `resolveEffectiveWeekOff`/`isWeekOff`/`isAltSaturdayOff`, `computeLateness`.
- Shared payroll math for native payslip render: `computeCTCBreakdown`, `formatINR`,
  `sumLineItems`, `partitionByTaxable`.
- Employee-safe payroll reads exist: `getMyPayslips` (visible = processed|paid),
  `listPayrollLineItems` (owning employee), `getMyCompensation`.
- Profile self-edit whitelist + `ProfileSaveResult` fieldErrors pattern
  (`profile.ts:160-176`), emergency-contact separate action.
- Notification trigger points for future push mirroring: `approveLeave`/`rejectLeave`
  emails, `markPayrollPaid → sendPayslipEmail`, doc-reminders cron.

## Constraints carried from Phase C

- Expo Router root `apps/mobile/src/app/`; only `EXPO_PUBLIC_*` env vars; never
  touch `metro.config.js` resolveRequest or the manual `eslint.config.js` port;
  lockfile must retain `swc-linux-x64-gnu`; check prod Clerk
  `force_organization_selection` before mobile points at production.
