# Work-from-home requests + work arrangement (Office / Hybrid / Remote)

**Ask (Medialoop, 2026-10-01):** add "Work From Home" as a leave category; office-based
employees get **2 WFH days**, each needing **prior approval**; full-time remote employees
are not limited. Also: show who is remote and who isn't.

## Recommendation in one line

Build WFH as its **own request type** (same request/approve experience as leave, but a
separate record) plus a per-employee **work arrangement** field. Don't make it a leave type.

## Why not a leave type

A WFH day is a **working** day. Approved leave means "not working", and the product treats
it that way in many places. A WFH leave type would quietly give wrong answers in each:

| Where approved leave is used today | What a "WFH leave" would do |
|---|---|
| Attendance report / month calendar (leave outranks attendance) | WFH day shows **L (on leave)** even though they clocked in and worked |
| Late-arrival rules (`countableLates` skips approved-leave days) | Late clock-in on a WFH day is **silently excused**; the penalty ladder never sees it |
| Leave balance cards + Insights leave utilisation | WFH inflates "leave taken" and leave-trend charts |
| Directory / dashboard "on leave" status | WFH employees look **absent** to colleagues |
| Leave balance is per **year** (`days_per_year`) | "2 per month" **can't be enforced**; only "24 a year", which lets someone take 10 in one month |
| Payroll LOP (only `unpaid` type) | Fine today, but one wrongly-configured type turns WFH into salary deductions |

Quick-fix option (no code): Medialoop adds a custom leave type "Work From Home" with 24
days/year. It works today but has every problem above. Only as a stopgap, and only if they
accept that WFH days show as leave and lateness isn't counted on them.

## Proposed design

### 1. Work arrangement per employee
`employees.work_arrangement`: **office** (default) · **hybrid** · **remote**, editable in the employee dialog,
the CSV importer and the bulk edit.
- **Badges** in Employees, Directory, Team Today and the mobile People tab. **Filter** by arrangement.
- **Remote** employees: no WFH requests needed, no quota. They clock in from anywhere.
- **Hybrid** (future-proofing): fixed WFH weekdays (e.g. Tue/Thu) with no request; extra days use the request flow.
- **Office**: WFH only via an approved request, within the monthly allowance.

### 2. WFH policy (Settings → Attendance → Work from home)
Org-level (`organizations.settings.attendance.wfh`):
- `enabled`
- `monthly_allowance` (Medialoop: **2**)
- `applies_to`: office (and hybrid extras)
- `min_notice_days` (e.g. 1 = by the day before)
- `over_quota`: **block** or **allow with admin approval**
- `half_day` allowed?

Quota counts approved + pending requests in the IST calendar month. It doesn't carry over.

### 3. The request flow
- Employee: **Request → Work from home** next to Request leave, on web and mobile. Pick a date
  (or several), add a reason, and see "1 of 2 WFH days left this month".
- Routed to the employee's **reporting manager(s)** + owners/admins: same routing, emails and
  approval inbox as leave (19/20 Medialoop staff have a reporting manager).
- Approve / reject, with a reason on reject. The employee is emailed and notified.
- Cancel before the day. Admins can add a WFH day retroactively ("worked from home
  yesterday, approved after the fact"), recorded as such.
- Table `wfh_requests`, **one row per day**, so monthly quotas and month boundaries
  stay simple. Columns: `org_id, employee_id, date, half_day, status
  (pending/approved/rejected/cancelled), reason, decided_by, decided_at, decision_note,
  created_by`. Unique `(employee_id, date)` among active rows. It also blocks a WFH day
  that overlaps approved leave.

### 4. What a WFH day means for attendance
- They **still clock in** on the web (Medialoop is web-only timekeeping). Hours, sessions and
  **lateness apply as normal**: WFH is not an excuse.
- Reports, the month calendar and history show **WFH** (new status code), not P or L. The
  report summary gains a "WFH days" count.
- **Team Today** shows a "WFH" chip, so managers know who's home vs in the office.
- Later, with Location-verified clock-in: a remote punch by an **office** employee on a day
  **without** approved WFH gets flagged "Remote, no WFH approval" for admin review.

### 5. Reporting
- WFH days per employee per month (report column + CSV).
- Insights (later): office vs remote mix, and WFH usage trend.

## Phasing

| Phase | Scope | Effort |
|---|---|---|
| **1** | Work arrangement field + badges + filter (Employees, Directory, Team Today) | ~½ day |
| **2** | WFH policy + request/approve flow on web + emails + quota + attendance "WFH" status in history/reports/calendar | ~2 days |
| **3** | Mobile request + approvals inbox entry; mobile People badge | ~1 day + app update |
| **4** | Hybrid fixed days; remote-punch-without-approval flag; Insights | later |

## Medialoop decisions (2026-10-01)
1. **2 per month.** 2. **Reporting manager approves.** 3. **Same-day requests are fine.**
4. **Beyond 2: allowed, but only an admin can approve those days.** The allowance is the same
   for every office employee. 5. **No half-day WFH.** 6. **Remote:** Ashreya Bhatotia,
   Siddharth Baheti, Dimple Tewani (set). "Fatema" and "Sanket Mantri" don't match any Medialoop
   employee (the only Sanket is Bhavsar), so they still need confirming. 7. Not answered;
   assumed yes (WFH days still need a clock-in).

**Built (phases 1–2, web):** see CLAUDE.md "Work from home + work arrangement".

## Original open questions
1. **2 WFH days per month** (assumed), or per week / per quarter?
2. **Who approves:** reporting manager, admins, or either?
3. **Notice:** must it be requested before the day? How far ahead (same day before 10am? the day before?)
4. **Beyond 2:** hard block, or allowed with admin approval as an exception?
5. **Half-day WFH** allowed?
6. **Who is fully remote?** We need the list to set them. Everyone else defaults to Office.
7. Should a WFH day still require clocking in? (Recommended: yes, same as office.)
