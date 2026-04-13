# Dashboard Redesign — Design Spec
**Date:** 2026-04-12
**Scope:** `src/app/dashboard/page.tsx` + `src/actions/dashboard.ts`
**Status:** Approved by user

---

## Goals

1. Make the dashboard role-aware — employees, managers, and admins each see data relevant to them
2. Surface the pending objectives count (already fetched, never displayed — bug fix)
3. Add "Who's Out Today" widget for all roles
4. Add personalized greeting with user first name
5. Show latest pinned announcements inline
6. Role-aware quick actions (4 actions swapped per role)
7. Personal leave balance strip for employee/manager
8. Grievance count stat for admins

---

## Layout (new)

```
[Greeting: "Good morning, Amol · Sunday, 13 April"]

[Announcement banner — pinned notices, max 2, dismissible per session]

[4 Stat Cards — role-aware content, same visual style]

2-col grid:
  Left:  Role-aware activity feed (admin/manager = all org leaves; employee = my requests)
  Right: Who's Out Today

2-col grid:
  Left:  Upcoming Deadlines (existing)
  Right: Quick Actions (role-aware)

[Active Review Cycles — if any, existing]
[My Leave Balance strip — employee/manager only]
```

---

## Role-Aware Stat Cards

| Card slot | Admin / Owner | Manager | Employee |
|-----------|--------------|---------|----------|
| 1 | Total Active Employees → /employees | Team headcount (direct reports) → /employees | My Leave Balance (total remaining days) → /leaves |
| 2 | Pending Leaves (all org) → /leaves | Pending Leaves (team) → /leaves | My Pending Requests → /leaves |
| 3 | Training Completion % (org) → /training | Training Completion % (team) → /training | My Training (% complete) → /training |
| 4 | Compliance Alerts (overdue org-wide) → /training | Pending Objectives Approvals → /objectives | My Overdue Training (count) → /training |

*Manager stat 1 (team headcount) uses the same org-wide count for now — we don't query by manager_id for simplicity. This is acceptable v1.*

---

## Role-Aware Quick Actions

| Role | Action 1 | Action 2 | Action 3 | Action 4 |
|------|----------|----------|----------|----------|
| Admin/Owner | Add Employee | Post Announcement | Review Leaves | Upload Document |
| Manager | Approve Leaves | Submit Review | Assign Training | View Directory |
| Employee | Apply for Leave | View My Documents | Submit Objectives | View Directory |

---

## New Widgets

### Who's Out Today
- Queries `leave_requests` where status=`approved`, start_date ≤ today ≤ end_date
- Shows: avatar initials, name, leave type, "back on [date]"
- Max 5 entries, "View all" link to /leaves
- If nobody out: "Everyone's in today 🎉" empty state
- Visible to all roles

### Announcement Banner
- Queries `announcements` ordered by is_pinned desc, created_at desc, limit 2
- Shown as slim colored cards above stat cards (category color: urgent=red, policy=amber, event=blue, general=muted)
- Only shown if announcements exist
- No dismiss (keep it simple — they navigate away or visit /announcements)

### My Leave Balance Strip (Employee / Manager only)
- Queries `leave_balances` joined with `leave_policies` for the current employee
- Shows each leave type as a compact pill: "Casual · 6 left"
- Shown below review cycles section
- Not shown for admin/owner (they manage leave, not consume it as much)

### Pending Objectives Fix
- Already fetched in dashboard action as `objectivePendingResult` but never returned or rendered
- Add `pendingObjectivesCount` to DashboardData return
- Shown in deadlines panel as "N objectives awaiting approval" item for managers
- Also shown as card 4 for managers (replaces compliance alerts)

---

## Data Changes — `getDashboardData()`

Add to return type:
```typescript
userRole: UserRole;
userFirstName: string;           // from employee record
whoIsOut: WhoIsOut[];
latestAnnouncements: LatestAnnouncement[];
pendingObjectivesCount: number;  // fix existing fetch
myLeaveBalances: MyLeaveBalance[];  // employee/manager only
myPendingLeavesCount: number;    // employee only
myOverdueTrainingCount: number;  // employee only
grievancesCount: number;         // admin/owner only (open + in_review)
```

New query: `whoIsOut` — leave_requests join employees where status=approved and start_date ≤ today ≤ end_date, limit 8

New query: `latestAnnouncements` — announcements order by is_pinned desc, created_at desc, limit 2

New query: `myLeaveBalances` — leave_balances join leave_policies where employee_id = current user's employeeId (only when employeeId exists)

New query: `grievancesCount` — grievances where status in (open, in_review), only for admin/owner role

Fix: include `objectivePendingResult.count` in the return as `pendingObjectivesCount`

Fix: `userFirstName` — query employees where id = employeeId; if no employee record, fallback to empty string (org creators before onboarding)

---

## Files Changed

| File | Change |
|------|--------|
| `src/actions/dashboard.ts` | Add 6 new queries, fix pending objectives, add role/name to return |
| `src/app/dashboard/page.tsx` | Role-aware cards, greeting, announcement banner, Who's Out, role-aware quick actions, leave balance strip |

No new files. No schema changes.

---

## Out of Scope
- Per-manager team filtering (headcount for direct reports only)
- Dismissible announcements (requires client state persistence)
- "New hires this month" callout (low priority)
- Payroll run status (complex, Business-tier only)
