# Medialoop Communications: client reference

Living record of how Medialoop is configured in JambaHR, why, and what's still open.
Update it whenever their setup changes. Last updated: **2026-10-02**.

| | |
|---|---|
| Org id | `9829a0cd-0ec0-4236-90e6-54d1d4a13cba` (note: `organizations.name` has a trailing space, so match with `ilike 'Medialoop%'`) |
| Plan | Business |
| Headcount | 20 active, all `full_time`, **no departments** (department-based targeting won't work for them) |
| Owner | Vinay Varpe |
| Admins | Samruddhi Ketkar, Sakshi Madhikar |
| Reporting managers | 19/20 have `reporting_manager_id`, 17/20 also have `reporting_manager_2_id` |
| Supabase project | `imjwqktxzahhnfmfbtfc` (HRme). All prod DB work goes through the Supabase MCP, never `.env.local` keys |

---

## 1. Attendance

### Timekeeping: web & app only (since 2026-09-30)
- `settings.attendance.timekeeping_source = "web_app"`, `timekeeping_source_from = "2026-09-30"`.
- Clock-in/out, hours and lateness come **only** from the web/mobile Clock In button (and admin manual punches). The biometric device only records **presence** (`device_first_seen_at` etc.).
- Someone seen at the device but never clocked in = **present, not clocked in** (report status **P**).
- Built in PR #50 (`fa05106`), migration **112**. Operator notes: CLAUDE.md "Web-only timekeeping mode".
- **Why:** Medialoop wanted people to clock in from the web; the device stays as a presence record.

### Clock in again during the day (since 2026-10-01, PR #52 `5a34a95`)
- Staff can clock out and back in any number of times until the day ends.
- Odd punch count = clocked in now. Hours = sum of closed sessions (breaks between sessions are excluded). The **first** clock-in is the arrival (lateness).
- Midnight auto clock-out closes only the open (last) session: at first-in + shift hours, but never before the last clock-in (then 2 min after it).
- Only applies to `web_app` orgs; `all`-mode orgs (TMP) are unchanged.

### Shift
| Name | Start | End | Grace | Break | Total | Default |
|---|---|---|---|---|---|---|
| General | 10:00 | 19:00 | **0 min** | **0 min** | 9 h | yes |

- Changed 2026-10-01 at the client's request (was a different window). No break deduction, because "since it is manual clock in-out from portal they will not clock out for breaks".
- Assigned to all 20 employees from 2026-10-01 (`shift_assignments`: 20 rows).

### Late-arrival rule (since 2026-10-01)
`late_policies` row `291c9cc7-…`, enabled:

| Setting | Value | Meaning |
|---|---|---|
| `late_definition` | `shift_grace` | late = clock-in after shift start + grace = **after 10:00:00** |
| `fallback_cutoff_time` | 10:00 | used if someone has no shift |
| `consequence` | `leave_deduction` | the penalty ladder (not bonus block) |
| `evaluate_from` | **2026-10-01** | lates before this never count |
| `ladder_warning_at` | 3 | warning email on the 3rd late in a month |
| `ladder_deduct_at` | 5 | deduction on the 5th late |
| `ladder_repeat` | true | …and every 5th after that (10th, 15th …) |
| `ladder_leave_type` / `ladder_deduct_days` | casual / 1 | 1 CL per step |
| `ladder_lop_fallback` | true | no CL left → LOP; 0.5 CL left → 0.5 CL + 0.5 LOP |
| `ladder_cc_managers` / `ladder_cc_admins` | true / false | reporting managers CC'd on emails |
| `ladder_dispute_days` | 2 | window mentioned in emails |
| channels | email only | no WhatsApp provider configured |
| `threshold_days` | 3 | legacy bonus-flag threshold (not the consequence here) |

- **Who it covers:** 17 employees, i.e. everyone **except** the owner (Vinay) and the two admins (Samruddhi, Sakshi), as the client asked. Targeting is by employee because they have no departments.
- Ladder engine: PR #48 (`881f8be`), migration **111**; see CLAUDE.md "Late-arrival penalty ladder".
- Admin tools: Attendance → **Late arrivals** tab (excuse a day, waive a deduction; reason required).

### Biometric device
- eSSL `NYU7261204139`, runs via the on-prem **Caddy HTTP→HTTPS relay** (the unit can't do TLS; gotcha #99).
- **Silent since 2026-09-10** (last seen 14:12 UTC). Not urgent now that the device is presence-only, but presence data is missing until it's back. The founder-only `device-health-check` cron has **never** stamped `silence_alerted_at`, so that alert path looks broken (open investigation).

---

## 2. Work from home + work arrangement (since 2026-10-01/02)

### Work arrangement
- `employees.work_arrangement`: **Remote** = Ashreya Bhatotia, Siddharth Baheti, Dimple Tewani. Everyone else **Office**.
- The client also named "Fatema" and "Sanket Mantri": neither exists in their JambaHR (the only Sanket is Bhavsar). The user said to **ignore them** (2026-10-01).
- Admins change it in Employees → Edit → Work arrangement. Badges show in Employees (+ filter), Directory, Team Today.

### WFH policy
- `settings.attendance.wfh = { enabled: true, monthly_allowance: 2 }` (switched on 2026-10-01 ~21:00 IST).
- Client decisions (2026-10-01): **2 per month** (IST calendar month, pending + approved count), **reporting manager approves**, **same-day requests allowed**, **beyond 2 = allowed but only an admin can approve**, **no half days**. Remote staff never request. WFH days still need a clock-in (assumed; client didn't answer, recommended yes).
- WFH is **its own request**, not a leave type, deliberately (see `docs/planning/2026-10-01-work-from-home-requests.md` for why).
- Employees: Leaves → Work from home → Request WFH. Approvers: same panel → "Work-from-home approvals".
- Dashboard card "Working from home · next 7 days" (PR #54) shows approved WFH to everyone.
- Built in PR #53 (`189ee33`), migration **113**.

---

## 3. Sign-in / accounts

- Prod Clerk audit (2026-10-01): all 20 have login accounts; **only 3 had a password**; emails verified 20/20; phones attached 17/18.
- **Vedika's phone is not on her login** (phone sign-in fails for her). Fix: Employees → **Sync phone logins** as a Medialoop admin; if that fails her number is likely on another Clerk user.
- Siddharth and Vinay have **no phone** on their profile.
- Set-password banner + `/account/security` page shipped in PR #51 (`7f8cee6`). Staff were emailed "How to sign in to JambaHR: 3 ways" on 2026-10-01 (20/20 accepted).
- Prod Clerk: `delete_self` turned **off** 2026-10-01 (so the account page shows no "Delete account"). Prod secret key was rotated the same day (old key revoked, verified 401).

---

## 4. Emails sent to Medialoop staff

| Date | Email | Recipients | Source |
|---|---|---|---|
| 2026-10-01 | "How to sign in to JambaHR: 3 ways" | 20/20 | `apps/web/scripts/send-sign-in-options.tsx` + `components/emails/sign-in-options.tsx` |
| 2026-10-02 | "You asked, we built it: what's new in JambaHR" (clock in again, WFH, dashboard cards, Remote badge) | 20/20 | `apps/web/scripts/emails/medialoop-update-2026-10.tsx` + `send-medialoop-update.tsx` (PR #55) |
| (earlier) | Announcement-feature mailer (brief, sent by the founder to the client) | client | n/a |

All from `JambaHR <noreply@jambahr.com>`, reply-to support@. Delivery status per message is in the Resend dashboard.

---

## 4a. Payroll policy

- **No TDS / income-tax deduction (client decision, confirmed 2026-10-02).** Medialoop does not deduct income tax from salaries; employees handle their own tax filing. Payroll for this org must treat TDS as optional and leave it at 0 unless they ask otherwise.
- **Joiners are paid from their first working day (2026-10-05).** Their sheet paid Vedika Rakhewar (joined Mon 3 Aug 2026; 1–2 Aug were a weekend) the full ₹30,000. The engine counted calendar days and paid 29/31 (₹28,065 gross, ₹26,076 net instead of ₹27,887). It now treats a joining date preceded only by week-offs/holidays as a full month. A mid-month joiner is still prorated from the joining date. This relies on the week-off policy, **set 2026-10-05: Saturday + Sunday off, `effective_from` 2026-08-01**. It's backdated so the Aug run sees it. That was safe: there were no weekend late arrivals, and the late rule only counts from 2026-10-01.
- EPF wage ceiling ₹15,000 → ₹25,000 from pay month Sep 2026 (₹1,800 → ₹3,000). This is **statutory** (Cabinet approval 16 Sep 2026), so it's carried by JambaHR's standard EPF rule (migration 121), not a Medialoop override. The old payroll code (`ctc.ts`) still hard-codes ₹1,800; the new engine (branch `feat/payroll-engine`) applies it. Analysis: `docs/planning/payroll/payroll-epf-analysis-notes.md`.

---

- **Pay slip details set 2026-10-02** (from their Aug 2026 slip):
  - Legal name: MEDIALOOP COMMUNICATION PVT. LTD.
  - Address: Plot No. 39, S No. 23/1, Vinudavan Bungalow, Sinhagad Road, Anand Nagar, Pune 411051
  - Contact: www.medialoop.in | finance@medialoop.in
  - Logo: uploaded
  - GSTIN: not provided yet
  - Editable in Settings → Payroll → Pay slip details once the payroll engine branch ships.
- **Employee IDs imported 2026-10-05** from the NN salary sheet (`NNver0.00a`): employee code (001–017, NOT the biometric PIN), gender, UAN for all 17, ESIC for the 7 covered. Audited in `payroll_audit_log`. Still missing: PF numbers (none), PAN for Samruddhi, Dinesh, Santosh, Sanskruti. Edit in Employees → Edit → Payroll & statutory IDs.
- Pay slip employee block follows the October layout; fields can be hidden or relabelled in Settings → Payroll → Pay slip details → Employee details on the slip.

---

## 5. Data quality issues (open)

- **Sameer Atar's first name is blank** (it read "Sameer" on 2026-10-01 morning; edited since). Re-enter in Employees → Edit.
- 3 of 20 have **no date of birth** → no birthday on the dashboard card.
- No departments → manager scope for attendance relies on reporting managers only.

## 6. Open items / follow-ups

- [ ] Verify on prod with a real Medialoop user: request WFH → manager approves → clock out & back in.
- [ ] Mobile app: WFH request/approvals + Remote badge (phase 3); multi-session clock-in UI on mobile.
- [ ] Device `NYU7261204139` offline since 2026-09-10; investigate why the device-health alert never fired.
- [ ] Vedika phone login; Sameer name; missing DOBs.
- [ ] Once the joiner fix is deployed, recalculate the Aug 2026 draft run. Vedika should come out at ₹30,000 gross / ₹27,887 net.
- [ ] Re-run the Clerk password audit in a week to see uptake (needs the prod Clerk key; rotate after).
