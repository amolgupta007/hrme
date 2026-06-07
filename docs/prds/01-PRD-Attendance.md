# PRD 01 — Attendance Module (Enhancement)

**Product:** JambaHR
**Module:** Attendance & Shifts
**Status:** Draft for review
**Owner:** Amol (Product Owner / Lead Dev)
**Build priority:** 1 of 5 (first)
**Doc type:** Combined Product + Business Requirements

---

## 1. Background & Problem

JambaHR's current attendance supports a single regular shift (default 8h, with the owner already able to change default hours). This is too rigid for the diverse Indian SMB customer base — manufacturing, retail, hospitality, security, logistics, and BPO firms run **multiple shifts**, **rotational rosters**, and **varied week-off policies**. To position JambaHR as a comprehensive platform "for all kinds of organizations," attendance must support a configurable shift system, rotational assignment, overnight shifts, overtime, and flexible week-offs.

## 2. Goals

- Let owner/admin define a **shift master** (named shifts with timings) reflecting the organization's working patterns.
- Let managers **assign and rotate** employees across defined shifts.
- Support **overnight shifts** (crossing midnight) with correct day attribution.
- Support **overtime (OT)** computation tied to shift hours, feeding into payroll.
- Make **week-offs configurable** at org level and overridable per employee.
- Assign shifts at both **employee** and **department** level.

## 3. Non-Goals (this phase)

- Biometric / hardware device integration (future).
- Auto-rostering algorithms / AI shift optimization (future).
- Geo-based attendance (covered by JambaGeo PRD, separate).

## 4. Success Metrics

- % of customer orgs that configure ≥2 shifts within 30 days of release.
- Reduction in manual attendance corrections per pay cycle.
- OT hours correctly flowing into ≥95% of payroll runs without manual edits.
- Manager time-to-assign a full team roster < 5 minutes.

## 5. User Roles & Permissions

| Capability | Owner | Admin/HR | Manager | Employee |
|---|---|---|---|---|
| Define shift master (create/edit shift types & timings) | ✅ | ✅ | ❌ | ❌ |
| Configure org week-off policy | ✅ | ✅ | ❌ | ❌ |
| Override week-off per employee | ✅ | ✅ | ✅ (own team) | ❌ |
| Assign / rotate shifts to employees | ✅ | ✅ | ✅ (own team) | ❌ |
| View own roster & shift | ✅ | ✅ | ✅ | ✅ |
| Mark / regularize attendance | ✅ | ✅ | ✅ | ✅ (self, if enabled) |

> Roles follow existing Clerk Organizations role model. Manager scope = own department/team only.

## 6. Functional Requirements

### 6.1 Shift Master (Owner/Admin — Settings → Attendance)
- Create named shifts: e.g. **Morning (06:00–15:00)**, **Evening (14:00–23:00)**, **Night (22:00–06:00)**, **General (10:00–18:00)**.
- Each shift has: name, start time, end time, total hours (auto-calc), break/unpaid minutes, grace period (late mark), half-day threshold, OT eligibility flag.
- Mark a shift as **overnight** automatically when end time < start time.
- Set one shift as the **org default**.
- Edit/deactivate shifts (deactivation must not break historical records).

### 6.2 Rotational Shift Assignment (Manager)
- Manager selects employee(s) and assigns a shift for a date range.
- Manager can **rotate** an employee — e.g. change a "rotational" placeholder into a concrete Morning/Evening/Night for a given week.
- Bulk assign a shift to a whole department.
- Roster view: calendar/grid showing who is on which shift per day.
- Conflict detection: warn if an employee is double-assigned or assigned on a week-off.

### 6.3 Overnight Shift Handling
- A shift crossing midnight (e.g. 22:00–06:00) is attributed to the **start date** (configurable: start-date vs end-date attribution at org level).
- Attendance, hours worked, and OT compute correctly across the date boundary.

### 6.4 Overtime (OT)
- Hours worked beyond shift total = OT (configurable: per-day OT, or weekly-threshold OT).
- OT multiplier configurable (e.g. 1.0x, 1.5x, 2.0x) at org level; statutory minimums noted for India.
- OT records flow to Payroll module as a line item per employee per cycle.
- Owner/admin can approve/reject OT before it reaches payroll (maker-checker optional toggle).

### 6.5 Week-Off Configuration (Settings → Attendance)
- Org-level policy: 5-day / 6-day week; which days are off (e.g. Sun only; Sat+Sun; alternate Saturdays).
- Alternate-Saturday support (1st/3rd off, or 2nd/4th off).
- Per-employee override (e.g. a 6-day employee in a 5-day org).
- Week-offs reflected in roster, attendance %, and payroll day-count.

### 6.6 Half-Days, Short-Leave & Regularization
- Half-day auto-flag when worked hours < configured half-day threshold.
- Short-leave (configurable max minutes) without marking absent.
- Regularization request/approval flow (employee requests, manager approves) — optional toggle.

## 7. Data Model (high level — Supabase)

- `shifts` (id, org_id, name, start_time, end_time, total_hours, break_minutes, grace_minutes, half_day_threshold, is_overnight, is_default, ot_eligible, ot_multiplier, active)
- `shift_assignments` (id, org_id, employee_id, shift_id, date_from, date_to, assigned_by, type[fixed|rotational], created_at)
- `week_off_policy` (id, org_id, week_type[5|6], off_days[], alt_saturday_rule, effective_from)
- `employee_week_off_override` (id, employee_id, week_type, off_days[], effective_from)
- `attendance_records` (extend existing: + shift_id, ot_minutes, attributed_date, status[present|absent|half|short|weekoff|holiday|leave])
- `ot_records` (id, org_id, employee_id, cycle, ot_minutes, multiplier, approved_by, status)

> Multi-tenant: every table carries `org_id` and enforces RLS as per existing pattern.

## 8. UX Notes

- Shift master lives under **Settings → Attendance** (consistent with existing dark-mode settings work).
- Manager roster = weekly grid (employees as rows, days as columns, shift chips per cell), with drag-to-assign (reuse JambaHire Kanban drag patterns where sensible).
- Color-code shifts (Morning/Evening/Night/General) for fast scanning.

## 9. Edge Cases

- Employee changes department mid-cycle → roster + week-off recompute from effective date.
- Shift timing edited after attendance logged → historical records keep the snapshot used at log time (store resolved hours on the attendance record).
- Public holiday overlapping a night shift.
- Daylight / timezone — assume single India timezone (IST) for now; note as assumption.

## 10. Dependencies

- Payroll module (OT + day-count consumption) — coordinate with PRD 02.
- Existing default-hours setting (migrate into shift master as the default shift).

## 11. Phasing

**Phase 1 (MVP)**
- Shift master (define shifts + default).
- Manual shift assignment per employee + per department.
- Overnight handling.
- Org-level week-off policy (5/6 day, fixed off days).

**Phase 2**
- Rotational rotation UI + roster grid + conflict detection.
- OT computation + approval + payroll feed.
- Per-employee week-off override + alternate-Saturday.

**Phase 3**
- Regularization workflow, half-day/short-leave automation, holiday calendar integration.

## 12. Open Decisions / Assumptions

- **A1:** Overnight attribution defaults to **start date** (configurable). Confirm preference.
- **A2:** OT model defaults to **per-day beyond shift hours**; weekly-threshold optional. Confirm.
- **A3:** Single timezone (IST) assumed.
- **A4:** Regularization is Phase 3 and toggle-able. Confirm if needed earlier.
