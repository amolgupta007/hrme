# Public Holidays — Design

**Date:** 2026-10-07 · **Status:** approved in conversation, awaiting spec review
**Branch:** `feat/public-holidays` · **Related:** PR #68 (seed-date fix, already applied to live data)

## 1. Why

Holidays are read in eight places but **written only once**, by the new-org seed (`createOrganization` → `DEFAULT_HOLIDAYS_2026`). There is no admin UI, so clients can't fix dates, add their own days, or set up next year. As of 2026-10-07, no org has a single 2027 holiday.

Holidays are also treated differently from one consumer to the next:

- **Leave** counts calendar days (`computeLeaveDays`). A leave across a holiday or weekend spends balance on those days.
- **Payroll LOP** reads `leave_requests.days`, so a paid holiday inside unpaid leave is docked as LOP.
- **Attendance reports and the mobile calendar** mark *every* holiday as **H**, optional ones included. **Payroll and late counting** use mandatory holidays only.
- **The roster** shows nothing for holidays.

**Success looks like this:**
- A client sets up and maintains its own calendar, including next year, without us.
- A leave over a holiday is counted the way that leave policy says.
- The leave form, balance, payroll, attendance report and mobile app all agree about which days are holidays.

### Data fixes already done (2026-10-07, PR #68)

- Five wrong seeded 2026 dates were corrected in the six seeded orgs, using the central-government list:

  | Holiday | Was | Now |
  |---|---|---|
  | Eid ul-Fitr | 31 Mar | 21 Mar |
  | Eid ul-Adha | 7 Jun | 27 May |
  | Janmashtami | 20 Aug | 4 Sep |
  | Dussehra | 11 Oct | 20 Oct |
  | Diwali | 29 Oct | 8 Nov |

- Medialoop, PlayPause and Sakura had **no** holidays. They now have the corrected 13.
- The seed file was fixed to match.

## 2. Decisions (locked)

| # | Decision |
|---|---|
| D1 | Holidays stay **org-wide**: one calendar per org, no location or department targeting. Multi-site clients are separate orgs. |
| D2 | Leave counting gets a **per-policy switch**, "Don't count holidays & week-offs", **ON by default for every type, unpaid included**. It only affects new requests. |
| D3 | A request is snapshotted: the server stores `days` **and** `excluded_dates`. Holiday edits never re-count leave that's already filed. |
| D4 | A range with no working days is rejected. A half-day flag only subtracts 0.5 when that edge day is a working day. |
| D5 | Presets are **national** (DoPT gazetted + restricted) **plus state** lists. v1 ships **National + Maharashtra** for **2026 and 2027**. Other states are added as data once checked against their own notification. |
| D6 | One definition of a holiday for an employee: **mandatory holiday ∪ that employee's approved optional-holiday claims**. An unclaimed optional holiday is only a label. |
| D7 | Optional holidays are **claimed**, up to a yearly allowance (default 2, hard cap). A manager or admin approves, like WFH. |
| D8 | It ships as four separate PRs (§8). PR 2 changes balances and payroll, so it deploys after hours. |

## 3. One resolver for non-working days

Today's `apps/web/src/lib/payroll/non-working-days.ts` (`loadNonWorkingDates`, one pay month) is extended into the single source for every consumer:

```ts
// plain module, NOT "use server" (gotcha #85)
loadNonWorkingDays(supabase, {
  orgId, employees: { id, department_id }[], from: 'YYYY-MM-DD', to: 'YYYY-MM-DD',
}): Promise<Map<employeeId, {
  holidays: Map<date, name>;   // mandatory ∪ approved claims (claims from PR 4)
  weekOffs: Set<date>;         // effective week-off: employee > department > org
  hasWeekOff: boolean;
}>>
```

- The pure combining step goes in `@jambahr/shared/holidays/non-working` so it can be tested without a database.
- Payroll's current `loadNonWorkingDates(month)` becomes a thin wrapper over it, so payroll results are unchanged. The existing engine and joiner tests must still pass with no edits.
- The month-calendar precedence (holiday > leave > week-off > attendance) and report precedence (holiday > leave) stay as they are. Only the definition of "holiday" changes (D6).
- **Errors:** any failed query throws. A failed read must never be mistaken for "no holidays" (gotcha #102).

## 4. PR 1: holiday calendar (Settings → Holidays)

### Schema: migration `123_holidays_admin.sql`
- `holidays.source text NOT NULL DEFAULT 'manual' CHECK (source IN ('seed','preset','manual','csv'))`. Existing rows backfill to `'seed'`.
- `holidays.created_by uuid NULL REFERENCES employees(id) ON DELETE SET NULL`.
- `holidays.updated_at timestamptz NOT NULL DEFAULT now()`, plus an `update_updated_at` trigger.
- Keep `UNIQUE(org_id, date)`: one holiday per date.
- Apply to the live database via Supabase MCP, and update `database.types.ts` in generator format.

### Presets
- Files: `packages/shared/src/holidays/presets/2026.ts` and `2027.ts`. Each exports `HolidayPreset[]`:
  `{ region: 'national' | 'MH', name, date, kind: 'gazetted' | 'restricted' | 'state' }`.
- The source notification URL goes in a header comment in each file.
- National 2027 comes from the DoPT list of 16 Jul 2026 (17 gazetted + 32 restricted). Maharashtra comes from the Maharashtra GAD notification for each year.
- **Two holidays on one date** (e.g. 15 Aug 2027: Independence Day and Milad-un-Nabi): the preset keeps both, and import joins them into one row, "Independence Day / Milad-un-Nabi".
- **Test:** every date is valid and inside its file's year; no duplicate `(region, date, name)`; every `kind` matches its `region`.

### Actions: `src/actions/holidays.ts`
| Action | Who | Notes |
|---|---|---|
| `listHolidays(year)` | any org member | ordered by date |
| `createHoliday({ name, date, isOptional })` | admin | name 1–80 chars; a clash (23505) returns "There's already a holiday on {date}" |
| `updateHoliday(id, …)` | admin | must belong to the org; same clash handling |
| `deleteHoliday(id)` | admin | org-scoped |
| `getHolidayPreset(year, region)` | admin | returns preset rows marked `alreadyAdded` |
| `importHolidays(rows, source: 'preset' \| 'csv')` | admin | skips dates that already exist; returns `{ added, skipped }` |
| `get/updateHolidaySettings({ optionalAllowance })` | admin | used by PR 4; stored at `organizations.settings.holidays` |

Every mutation calls `revalidatePath` on `/dashboard/settings`, `/dashboard/leaves`, `/dashboard` and `/dashboard/attendance`.

### UI
- A `HolidaysSection` sits in `settings-content.tsx` directly after **Leave Policies**, as a `CollapsibleSection` with id `holidays`.
- **Year tabs:** current year and next year, with a selector for older years.
- **Table:** date, weekday, name, and a Mandatory or Optional badge. A muted hint appears when the date falls on the org's week-off. Each row has Edit and Delete.
- **Add/Edit dialog:** name, date, and an Optional toggle.
- **Import from preset dialog:**
  - Pick a year and a region (National / Maharashtra).
  - Checklist: gazetted and state holidays are pre-ticked and mandatory; restricted ones are unticked and optional (the toggle can change this per row). Dates the org already has are greyed out as "already added".
- **Import CSV dialog:** columns `name,date,optional`; parsed client-side; the same checklist preview with per-row errors.
- **Note shown when editing a past date:** "Reports update now; late marks re-count overnight; locked payroll runs don't change."

### Seeding and the year-end nudge
- `DEFAULT_HOLIDAYS_2026` is deleted. `createOrganization` seeds the **national gazetted** preset from today to the end of the current year, plus next year's if that preset exists. These rows get `source='seed'`.
- **Year-end nudge:** from 1 November, if the org has zero holidays in the next year, admins see a dashboard banner: "Set up your {next year} holidays →", linking to `/dashboard/settings#holidays`. It can be dismissed for the session (`localStorage`, wrapped in try/catch).

### Assistant
- Add a route-registry entry and a help article, `holidays_manage.md`, and bump the article-count test.
- After merging, run `npm run embed:help` (gotcha #64).

## 5. PR 2: holiday-aware leave counting

### Schema: migration `124_leave_non_working_days.sql`
- `leave_policies.exclude_non_working_days boolean NOT NULL DEFAULT true`. This applies to existing policies too (D2).
- `leave_requests.excluded_dates date[] NULL`. NULL means the request was counted on calendar days, which covers every request filed before this PR.

### Pure math (`@jambahr/shared/leaves`)
`computeLeaveDays(start, end, startHalf, endHalf, opts?: { excludeDates?: ReadonlySet<string> })` returns `{ ok: true, days, excludedDates: string[] } | { ok: false, error }`.
- Without `opts`, it behaves exactly as today. All existing tests must pass unchanged.
- With `opts`:
  - `days` = calendar days − excluded dates.
  - A half-day flag subtracts 0.5 only if that edge date isn't excluded.
  - If no working days remain: `"No working days in this range"`.
  - Otherwise `"Leave must be at least half a day"` keeps its current meaning.

### Server
- `requestLeave` (web) and `POST /api/mobile/leave/apply` both:
  1. load the policy's `exclude_non_working_days`;
  2. if it's on, call the §3 resolver for the target employee and range (holidays ∪ week-offs);
  3. derive `days` and `excludedDates`, and persist both. A client-supplied `days` is never trusted.
- Overlap and balance checks are unchanged; they run on the derived `days`.

### Previews
- **Web form** (`leave-request-form.tsx`): when the dates or the target employee change, call a new read-only action, `getNonWorkingDaysForLeave({ employeeId, from, to })`. It's scoped like `requestLeave`: self, the caller's direct reports for a manager, anyone for an admin.
- The preview reads: "3 days · excludes Sat 7 Nov, Sun 8 Nov (Diwali)". It shows "Calculating…" while loading. If the call fails, it falls back to calendar days and tells the user "the final count is checked when you submit".
- **Mobile sheet:** the `GET /api/mobile/leave` payload adds `nonWorkingDays` for the next 365 days (holidays plus week-offs, for the caller) and each policy's switch. The sheet passes them to `computeLeaveDays`. The server still has the final say.

### Payroll LOP
- In `engine-run.ts` `loadUnpaidLeaveDays`, when a request spans a month boundary and `excluded_dates` isn't NULL, count the days inside the month minus the excluded dates inside the month.
- Half-day flags apply in whichever month holds that edge date.
- Requests with NULL `excluded_dates` keep today's calculation, so past runs reproduce exactly (parity test).

### Settings
- The leave-policy add/edit dialog gets a "Don't count holidays & week-offs" switch with a one-line explanation.

## 6. PR 3: roster, visibility and the single holiday definition

- **Consumers switched to the resolver (D6):**
  - `fetch-report-data.ts` (attendance report)
  - mobile `GET /api/mobile/attendance` (month calendar)
  - `getMySchedule`
  - `late-counting.ts`
  - payroll (already wrapped in §3)

  Report **H** and the mobile calendar's `holiday` state now cover mandatory holidays plus approved claims only.
- **Roster:**
  - `RosterCell.holiday_name: string | null`, filled by `getRosterGrid` from the resolver.
  - `roster-cell.tsx` gives holiday cells a tint plus the name.
  - `detectAssignmentConflicts` adds a soft `holiday` conflict ("Diwali — assigning anyway"); the server doesn't block it.
- **Leaves → Holidays tab:** this year's list grouped by month, with Mandatory or Optional on each, for every role. PR 4 adds the Claim UI here.
- **Dashboard "Upcoming holidays" card:** shown for **every role**, not only employees. Optional holidays carry an "Optional" chip.
- **Mobile Home holiday card:** still lists upcoming optional holidays, labelled "Optional".

## 7. PR 4: optional-holiday claims

### Schema: migration `125_holiday_claims.sql`
```
holiday_claims(
  id uuid pk, org_id uuid → organizations, employee_id uuid → employees ON DELETE CASCADE,
  holiday_id uuid → holidays ON DELETE CASCADE, date date NOT NULL,
  status text CHECK IN ('pending','approved','rejected','cancelled') DEFAULT 'pending',
  decided_by uuid → employees NULL, decided_at timestamptz NULL, decision_reason text NULL,
  created_at timestamptz DEFAULT now(), updated_at timestamptz + trigger)
UNIQUE (employee_id, holiday_id) WHERE status IN ('pending','approved')
INDEX (org_id, date)
RLS enabled, no policies (service role only, like wfh_requests)
```

### Rules (`@jambahr/shared/holidays/claims`, pure)
`planHolidayClaim({ holiday, today, allowance, usedThisYear, leaveOverlaps, isWeekOff })` returns `{ ok } | { ok: false, error }`. A claim is rejected when:
- the holiday isn't optional;
- its date has passed (today is allowed);
- `usedThisYear` (pending + approved in that calendar year) is at or above `allowance` (hard cap);
- the date overlaps pending or approved leave;
- the date is already the employee's week-off.

`canDecideHolidayClaim(role, isManagerOfEmployee)`: owner or admin always; a reporting manager (via `src/lib/managers.ts`) for their reports. With no manager set, only admins can decide.

### Actions: `src/actions/holiday-claims.ts`
- `getMyHolidayClaims(year)`
- `claimHoliday(holidayId)`
- `cancelHolidayClaim(id)`: own claim, pending or approved, and the date must not have passed
- `listHolidayClaimApprovals()`
- `decideHolidayClaim(id, 'approved' | 'rejected', reason?)`: a reason is required to reject

If an approved claim is for **today**, `waitUntil` re-runs `recomputeAttendanceDay` for that employee and day, so the late mark clears. Earlier dates can't be claimed, and future dates are picked up as they come.

### Notifications
- `holiday-claim.tsx` (React Email, `FROM_EMAIL`):
  - **request:** sent to the manager(s), or to admins when no manager is set;
  - **decision:** sent to the employee.
- Plus in-app `notifications` rows.

### UI
- **Leaves → Holidays tab:** a Claim button on optional holidays still ahead, a "1 of 2 used" counter, and a "My claims" list with status and Cancel.
- **Approvals:** pending claims show next to the WFH approvals on the Leaves page.
- **Settings → Holidays:** an "Optional holidays each employee can take per year" input (0–10, default 2). At 0, claims are off and the Claim button is hidden.
- **Mobile:** v1 only respects approved claims (calendar, lateness). The claim flow on mobile comes later.

## 8. Delivery and verification

| PR | Contents | Deploy |
|---|---|---|
| 1 | §3 resolver + §4 (migration 123, Settings → Holidays, presets, seeding, nudge, help article) | normal |
| 2 | §5 (migration 124, counting, previews, LOP) | **after ~10 pm IST**, after a TestOrg check |
| 3 | §6 | after hours (touches lateness inputs) |
| 4 | §7 (migration 125) | after hours |

**Each PR:** typecheck, lint, and the full test suite. Pure functions are written test-first. Each PR is checked in the browser on TestOrg (localhost uses prod Supabase, with the dev identity = TestOrg) before merge. Migrations are applied before the code is deployed.

**Key tests:**
- **Resolver precedence:** employee, then department, then org week-off; a claim makes the date a holiday for that employee only.
- **`computeLeaveDays` with exclusions:** Fri–Mon over a weekend plus a holiday, half-days on excluded edges, the all-excluded range, and no-`opts` parity.
- **LOP month split** with `excluded_dates`, plus legacy-NULL parity.
- **Preset data integrity.**
- **Claim rules:** past date, cap, leave overlap, week-off, not optional.

## 9. Out of scope

- Location, department or employee targeting of holidays (D1).
- An org-wide calendar page combining holidays, leave and WFH.
- A sandwich rule.
- States other than Maharashtra in v1 (added later as data).
- Mobile claim flow, mobile holiday admin.
- Re-counting already-filed leave when holidays change (D3).
- Recording whether an employee actually worked a holiday (comp-off).
