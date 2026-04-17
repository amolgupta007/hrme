# JambaHR — Product Features Reference

> Complete feature reference for organizations evaluating or onboarding to JambaHR. Covers every module, capability, access level, plan availability, and known limitation — updated as of April 2026.

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Plan Tiers](#plan-tiers)
3. [Roles & Permissions](#roles--permissions)
4. [Dashboard](#dashboard)
5. [Employee Management](#employee-management)
6. [Directory & Org Chart](#directory--org-chart)
7. [Leave Management](#leave-management)
8. [Documents & File Hub](#documents--file-hub)
9. [Performance Reviews](#performance-reviews)
10. [Objectives & OKRs](#objectives--okrs)
11. [Training & Compliance](#training--compliance)
12. [Attendance & Time Tracking](#attendance--time-tracking)
13. [Grievances & Anonymous Feedback](#grievances--anonymous-feedback)
14. [Announcements](#announcements)
15. [Payroll & Compensation](#payroll--compensation)
16. [JambaHire — Recruiting Suite](#jambahire--recruiting-suite)
    - [Jobs](#jobs)
    - [Candidates](#candidates)
    - [Pipeline](#pipeline)
    - [Interviews](#interviews)
    - [Offers](#offers)
    - [Careers Page](#careers-page)
17. [Settings & Administration](#settings--administration)
18. [Cross-Cutting Capabilities](#cross-cutting-capabilities)
19. [Feature Matrix](#feature-matrix)
20. [Known Limitations](#known-limitations)

---

## Platform Overview

JambaHR is an all-in-one HR platform built for Indian small and medium businesses with 10–500 employees. It covers the full employee lifecycle — from hiring and onboarding to payroll and offboarding — in a single web portal. No spreadsheets, no switching between tools.

**Built for:**
- Business owners and HR managers who manage people operations directly
- Companies that want structured HR processes without a dedicated HR department
- Organizations with Indian payroll compliance requirements (PF, PT, TDS, new tax regime)

**Architecture:**
- Web-based (Next.js 14, responsive, works on desktop and mobile)
- Multi-tenant SaaS with org isolation at every layer
- Role-aware UI — every user sees only what they need

---

## Plan Tiers

JambaHR has three pricing tiers. Features unlock progressively across tiers.

### Starter — Free
Core HR for teams just getting organized.

| Feature | Included |
|---------|----------|
| Employee directory | ✅ |
| Leave management | ✅ |
| Announcements | ✅ |
| Attendance tracking | ✅ |
| Grievances (anonymous feedback) | ✅ |
| Dashboard | ✅ |
| Max employees | 10 |

### Growth — ₹500/employee/month
Structured HR for growing teams.

Everything in Starter, plus:

| Feature | Included |
|---------|----------|
| Documents hub with acknowledgment tracking | ✅ |
| Performance review cycles | ✅ |
| Objectives & OKR management | ✅ |
| Training & compliance tracking | ✅ |
| AI job description generator | ✅ |
| Hiring (jobs posting, candidate tracking) | ✅ |
| Max employees | 200 |

### Business — ₹800/employee/month
Full-stack HR for mature organizations.

Everything in Growth, plus:

| Feature | Included |
|---------|----------|
| Payroll & compensation | ✅ |
| Full hiring suite (interviews, offers, onboarding) | ✅ |
| Advanced analytics dashboard | ✅ |
| AI smart review summaries | ✅ |
| AI attrition risk indicators | ✅ |
| Semantic document search | ✅ |
| Public API access | ✅ |
| Max employees | 500 |

---

## Roles & Permissions

Every user in JambaHR has one of four roles. Roles are set per user and determine what they can see and do across every module.

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| **Owner** | Organization creator | All admin permissions + billing |
| **Admin** | HR/Operations manager | CRUD on all HR data, payroll, settings |
| **Manager** | Team lead | Approve leaves, review team, assign training |
| **Employee** | Individual contributor | View own data, self-service actions |

> Roles cascade: Owner > Admin > Manager > Employee. Actions allowed for a lower role are always available to higher roles.

**Feature visibility by role:**
- Employees see: their own leave, payslips, training, reviews, objectives, announcements, directory
- Managers additionally see: team leave requests, team attendance, team objectives for approval
- Admins additionally see: full org data, payroll runs, all grievances, all documents

---

## Dashboard

The central hub. Automatically adapts to the user's role — employees see personal summaries, managers see team overviews, admins see organization-wide metrics.

**Employee dashboard includes:**
- Leave balance cards per policy type (paid, sick, casual, etc.) with visual progress bars
- Pending leave requests count
- Overdue training count with direct links
- Pending objectives count
- Recent announcements (latest 3–5)
- Active grievances count

**Manager dashboard additionally includes:**
- Team member count and status distribution
- Employees currently absent or on leave
- Pending leave requests from team (with approve/reject links)
- Overdue training assignments for team
- Objectives pending approval

**Admin dashboard additionally includes:**
- Org-wide stats: total employees, active, on leave, inactive, terminated
- Payroll status (latest run)
- Grievance summary: open, urgent, recently submitted
- Compliance alerts: overdue mandatory training

**Plan availability:** All plans

**Limitations:**
- Dashboards show current state only — no historical trends or period-over-period comparison
- No export functionality
- No customizable widget layout

---

## Employee Management

Centralized employee database with full lifecycle management. Admins manage records; managers and employees view the roster.

**What admins can do:**
- Add employees with full profile: name, email, phone, date of joining, date of birth, gender, designation, department, role, reporting manager, employment type (full-time, part-time, contract, intern)
- Edit any employee record
- Change employee status: Active → On Leave → Inactive → Terminated
- Soft-terminate employees (status = Terminated; record preserved for history)
- Filter by department, role, status, or activation state
- Search by name, email, designation, or department
- **Bulk import employees from CSV** — upload a spreadsheet to pre-populate the employee directory in one step (see Bulk Import section below)
- **Send activation invites** — send Clerk-based email invites so employees can create their login accounts; send individually or in bulk

**What managers and employees can do:**
- View employee list (read-only)
- Search and filter

**Status display:**
- `Active` — green badge
- `On Leave` — amber badge (automatically shown when employee has an approved leave covering today)
- `Inactive` — gray badge
- `Terminated` — red badge
- `Not activated` — amber sub-badge shown below Active for employees who have no login account yet
- `Invite sent` — amber sub-badge for employees with a pending invite (expires after 7 days)
- `Invite expired` — red sub-badge for employees whose invite has expired

> The "On Leave" status is derived dynamically from approved leave records — it does not require manual status updates by admins.

**Plan availability:** All plans

**Limitations:**
- No custom fields (structure is fixed)
- No audit log of changes to employee records
- Cannot assign multiple roles to a single user

---

## Bulk Employee Import

Admins can import an entire team from a CSV file at `/dashboard/employees/import`.

**How it works:**
1. Download the CSV template (provided on the import page)
2. Fill in employee data — required columns: `first_name`, `last_name`, `email`, `role`, `employment_type`, `date_of_joining`
3. Optional columns: `phone`, `department`, `designation`, `date_of_birth`, `reporting_manager_email`
4. Upload the CSV — rows are validated client-side before any data is sent
5. Preview table shows every row: green for valid, red/greyed for skipped with the reason inline
6. Confirm import — valid rows are created as employees; skipped rows can be downloaded as `errors.csv` for correction and re-import

**Validation rules:**
- `role` must be: `admin`, `manager`, or `employee`
- `employment_type` must be: `full_time`, `part_time`, `contract`, or `intern`
- Dates must be `YYYY-MM-DD` format
- Duplicate emails (already in the org) are skipped — terminated employee emails flagged separately
- Duplicate emails within the same CSV batch are caught and skipped
- Rows that would exceed the plan's employee limit are skipped with a clear message

**Department and manager resolution:**
- `department` column is matched case-insensitively against existing departments — no match leaves the field blank (not an error)
- `reporting_manager_email` is matched against existing active employees — no match leaves the field blank (not an error)

**After import:**
- All imported employees have `status: active` but no login account yet
- Use the "Not activated" filter chip on the employees page to see them
- Click "Send Invites" to bulk-send activation invite emails to all unactivated employees

**Plan availability:** All plans (subject to the plan's employee limit)

---

## Directory & Org Chart

Visual employee directory with two views: a card grid and an org hierarchy tree.

**Card view:**
- Employee cards with name, designation, department, role badge
- Status dot: green (active), amber (on leave), gray (inactive)
- Department color ring (deterministic color per department, consistent across sessions)
- Manager name displayed on each card
- Search by name, email, designation, department, or manager
- Filter by department

**Org hierarchy view:**
- Tree structure built from reporting manager relationships
- Expandable/collapsible per manager node
- Color rings identify department membership at a glance
- Works for flat (2-level) to deep (5+ level) hierarchies

**Plan availability:** All plans

**Limitations:**
- No export of org chart (PNG, PDF)
- Org tree does not persist expanded/collapsed state across page refreshes
- No admin editing from within the directory (must go to Employees module)

---

## Leave Management

Leave request submission, approval workflow, balance tracking, and policy configuration.

**Policy configuration (admin):**
- Define leave types: paid, sick, casual, unpaid, earned, maternity, paternity, or custom
- Set days per year per policy
- Configure carry-forward rules
- Assign policies to employees

**Employee capabilities:**
- View leave balance per policy type with usage progress bars
- Submit leave requests: select type, from date, to date, reason
- Duration auto-calculated (excludes weekends where applicable)
- View history of own requests with status (pending, approved, rejected, cancelled)
- Cancel pending requests

**Manager capabilities:**
- View all pending leave requests from direct reports
- Approve or reject with optional comment
- View team leave calendar

**Admin capabilities:**
- View org-wide leave utilization
- Configure and edit leave policies
- View all employees' leave history

**Email notifications:**
- Leave request submitted → all managers/admins notified
- Leave approved/rejected → employee notified

**Plan availability:** All plans

**Limitations:**
- No half-day or hourly leave requests
- No automatic public holiday exclusion from leave duration calculation
- No leave encashment or payout rules
- No carry-forward accrual history view
- No team leave calendar for employees (manager-only view)

---

## Documents & File Hub

Centralized document storage with three-tier access separation and acknowledgment tracking for compliance requirements.

**Document spaces:**

| Space | Who can see | Purpose |
|-------|-------------|---------|
| **Company Wide** | All employees | Policy docs, handbooks, announcements requiring sign-off |
| **Personal Files** | Employee + admins | Contracts, ID proofs, personal documents |
| **Owner Vault** | Admins only | Confidential documents, restricted files |
| **Signed Records** | Admins | Audit log of completed acknowledgments |

**Upload & management (admin):**
- Drag-and-drop file upload
- Categories: policy, contract, id_proof, tax, certificate, other
- Flag documents as requiring acknowledgment
- Delete documents
- View acknowledgment status across all employees

**Acknowledgment workflow:**
- Admin uploads a policy and marks it as requiring acknowledgment
- All relevant employees see it in their "To Acknowledge" inbox
- Employee clicks Acknowledge to confirm receipt
- Timestamp and employee name are recorded
- Signed Records tab provides audit trail for regulatory audits

**Employee capabilities:**
- View company-wide documents
- Acknowledge required documents
- Upload and manage personal files in their own vault

**Search & filter:**
- Search by filename or uploader name
- Filter by category
- Filter by acknowledgment status: acknowledged, pending

**Plan availability:** Growth and above

**Limitations:**
- No document expiration dates or renewal reminders
- No version control or revision history
- Acknowledgment is a digital click (no handwritten or certificate-based signature)
- No OCR or document content search
- No encryption beyond HTTPS

**Standout:** The three-tier space model (company, personal, vault) combined with acknowledgment tracking makes this suitable for regulatory compliance use cases (e.g., POSH training confirmation, NDA acknowledgment, safety briefings).

---

## Performance Reviews

Cycle-based performance management. Admins create review cycles; employees complete self-reviews; managers complete manager reviews; cycles close when complete.

**Review cycle management (admin):**
- Create cycles with name and period: quarterly, half-year, annual, or custom date range
- Status: draft → active → completed
- Assign employees to participate in a cycle

**Review workflow:**
1. Admin creates and activates a cycle
2. Employees submit self-review (strengths, areas of improvement, rating)
3. Managers review their team — see self-review, add manager assessment
4. Admin closes cycle when all reviews are complete

**Review form fields:**
- Performance rating (scale)
- Strengths (free text)
- Improvement areas (free text)
- Overall comments
- Status tracking per reviewer

**Visibility:**
- Employees: submit self-review, view own completed review
- Managers: view team self-reviews, submit manager reviews
- Admins: view all, create cycles, close cycles

**Plan availability:** Growth and above

**Limitations:**
- No 360-degree or peer reviews
- No year-over-year comparison across cycles
- No export to PDF or Excel
- No competency framework or skill taxonomy
- Cycle closure is manual (not auto-triggered by dates)
- No calibration workflow for normalizing ratings across managers

---

## Objectives & OKRs

Goal-setting and OKR (Objectives & Key Results) management. Employees define objectives, submit for manager approval, and self-track progress through the period.

**Objective sets:**
- Period: quarterly, half-year, annual, or custom label
- One set per employee per period
- Multiple objectives per set
- Weighted objectives (relative importance percentage)

**Objective workflow:**
1. Employee drafts objectives with description, target, and weight
2. Submits set for manager approval
3. Manager approves (or rejects with feedback)
4. During the period: employee updates progress status per objective
5. At period end: objectives marked achieved, partially achieved, or missed

**Progress statuses:** on_track, achieved, partially_achieved, missed

**Views:**
- Employee: My Objectives (drafts, submitted, approved)
- Manager: Approvals tab (pending submissions from team)
- Admin: All Objectives (org-wide view)

**Plan availability:** Growth and above

**Limitations:**
- No parent/child OKR alignment (no company → team → individual cascade)
- No continuous progress percentage tracking (only final status)
- No template or rollover from prior periods
- No deadline enforcement
- No export or reporting

---

## Training & Compliance

Course library management, employee enrollment, progress tracking, and compliance dashboard for mandatory training.

**Course library (admin):**
- Create courses: title, description, category, duration, content URL
- Categories: ethics, compliance, safety, skills, onboarding, custom
- Mark courses as mandatory
- Set due date per course

**Enrollment:**
- Assign courses to specific employees or all active employees
- Override due date per enrollment
- Bulk assignment for org-wide mandatory training

**Employee training view:**
- Cards per enrolled course with progress bar
- Status: assigned, in_progress, completed, overdue
- Due date with red alert if overdue
- Link to external course content
- Self-report progress (update percentage)
- Upload completion certificate

**Compliance dashboard (admin, Business plan):**
- Org-wide completion rate
- Per-course: completion %, headcount enrolled, overdue count
- Mandatory vs. optional breakdown
- Overdue alerts panel with affected employee list
- Per-employee status grid

**Coming soon:** Auto-sync from Coursera, LinkedIn Learning, TalentLMS, Docebo, and Google Classroom via webhooks — real-time progress updates without manual entry.

**Plan availability:** Growth and above (compliance dashboard: Business)

**Limitations:**
- No built-in content hosting (external URL only)
- No quiz, assessment, or scoring
- No certificate auto-generation (manual upload required)
- Progress is self-reported (no LMS verification until auto-sync ships)

**Standout:** Mandatory course flagging with overdue alerts creates a compliance audit trail. Combined with document acknowledgment, this covers the two most common regulatory requirements for SMBs (training completion + policy sign-off).

---

## Attendance & Time Tracking

Clock in/out time tracking with daily summaries, team overview for managers, and 30-day history.

**Employee capabilities:**
- Clock in and clock out from any browser
- Live elapsed timer (HH:MM:SS) while clocked in
- Today's summary: clock-in time, clock-out time, total hours logged
- Status indicator: Not clocked in / Currently clocked in / Complete
- 30-day attendance history with date, clock-in, clock-out, duration
- Color coding: green if ≥ 8 hours, amber if < 8 hours

**Manager capabilities:**
- Team Today view: present count, not clocked in count, total team count
- Per-employee clock-in time, duration, still-in status
- 30-day history per team member (filterable by employee)

**Plan availability:** All plans (feature-flagged; enable per org in Settings)

**Limitations:**
- No geolocation or IP verification for clock-in
- No manual attendance entry or admin override for past dates
- No late arrival alerts
- No shift scheduling or roster management
- No automatic clock-out if employee forgets
- Clock-in is web-only (no mobile app)
- Overtime hours not automatically calculated

---

## Grievances & Anonymous Feedback

Structured grievance submission with anonymous mode, unique tracking tokens, and a manager inbox for resolution tracking.

**Submission form (any employee):**
- Type: complaint or suggestion
- Category: facilities, environment, interpersonal, safety, policy, suggestion, other
- Severity: low, medium, high, urgent
- Title and description
- Anonymous toggle: when enabled, submitter name is never stored

**On submission:**
- Unique tracking token generated: `GRV-XXXXXX` format
- Employee receives token to track their submission later

**Tracking (employee/anonymous):**
- Enter tracking token to check current status
- See: current status, last updated date, admin response notes
- No login required for anonymous submissions

**Manager inbox:**
- View all grievances (anonymous and named)
- Filter by status: open, in_review, resolved, closed
- Filter by severity
- Search by title
- Severity badges color-coded by urgency

**Resolution workflow:**
- Manager updates status: open → in_review → resolved → closed
- Adds response notes (visible to submitter via tracking token)

**Statistics (admin/manager):**
- Total grievances, open count, in-review count, urgent count

**Plan availability:** All plans (feature-flagged; enable per org in Settings)

**Limitations:**
- No escalation rules (urgent severity does not auto-notify)
- No attachments (text only)
- No SLA or due date enforcement
- Email notifications on status change not yet implemented
- No sentiment analysis or AI severity suggestion

**Standout:** The combination of anonymous submission and public tracking via token is rare in SMB HR tools. It gives employees a voice without fear of retaliation while still enabling meaningful HR follow-through.

---

## Announcements

Company-wide broadcast messaging. Admins post; all employees see on dashboard and in the Announcements page.

**Admin capabilities:**
- Create, edit, delete announcements
- Pin an announcement to the top of the list
- Unpin previously pinned announcements

**Announcement content:**
- Title
- Body (multi-line text, whitespace preserved)
- Posted by (admin name shown automatically)
- Time-ago format (e.g., "2 hours ago")

**Employee view:**
- Pinned announcements appear first
- Cards sorted by recency
- Pin badge visible on pinned items

**Plan availability:** All plans

**Limitations:**
- Plain text only (no rich text, bold, bullet formatting)
- No scheduled publishing
- No targeted audience (all employees see all announcements)
- No read receipts or view tracking
- No attachments

---

## Payroll & Compensation

End-to-end Indian payroll processing — from CTC configuration to payslip generation — with built-in tax compliance for FY 2025-26.

**Plan availability:** Business only

### Salary Structure Configuration

Admins configure compensation for each employee. All deduction components are automatically computed.

**Input fields:**
- Employee (locked after creation)
- Annual CTC (Cost to Company)
- State (for professional tax calculation)
- Include HRA (toggle)
- Metro city (toggle, for HRA percentage)
- Effective from date

**Auto-computed breakdown:**

| Component | Formula |
|-----------|---------|
| Basic Monthly | 40% of CTC ÷ 12 |
| HRA | 50% of Basic (metro) or 40% (non-metro), or ₹0 if HRA disabled |
| Special Allowance | CTC remainder after Employer PF + Gratuity |
| Employer PF | 3.67% of Basic annual (capped at ~₹1,100/month) |
| Employer Gratuity | 4.81% of Basic annual |
| Employee PF | 12% of Basic monthly (capped at ₹1,800/month) |
| Professional Tax | State-specific (see below) |
| TDS | New tax regime slabs (see below) |
| Gross Monthly | Basic + HRA + Special Allowance |
| Net Monthly | Gross − (Employee PF + PT + TDS) |

**Professional tax by state:**

| State | Rule |
|-------|------|
| Maharashtra | ₹0 (<₹10k), ₹150 (<₹15k), ₹200 (≥₹15k) |
| Karnataka, Telangana, AP | ₹200 if gross > ₹15k, else ₹0 |
| Gujarat | ₹200 if gross > ₹6k, else ₹0 |
| Tamil Nadu | ₹182 if gross > ₹21k, else ₹0 |
| West Bengal | Tiered: ₹0 / ₹110 / ₹130 / ₹150 / ₹200 |
| Delhi, Haryana, Rajasthan, UP | ₹0 (no PT) |
| Other | ₹200 if gross > ₹10k, else ₹0 |

**TDS calculation — New Tax Regime (FY 2025-26):**

| Annual Taxable Income | Rate |
|-----------------------|------|
| ₹0 – ₹4L | 0% |
| ₹4L – ₹8L | 5% |
| ₹8L – ₹12L | 10% |
| ₹12L – ₹16L | 15% |
| ₹16L – ₹20L | 20% |
| ₹20L – ₹24L | 25% |
| ₹24L+ | 30% |

- Standard Deduction: ₹75,000
- Rebate u/s 87A: Full tax rebate if taxable income ≤ ₹12L (effective zero tax)
- Health & Education Cess: 4% on total tax liability
- TDS = Annual Tax ÷ 12 (monthly deduction)

> Note: All employees use the New Tax Regime. Old regime support is planned.

---

### Monthly Payroll Runs

Admins run payroll monthly through a three-stage workflow.

**Stage 1 — Draft:**
- Create a new payroll run for a month
- Set working days (default: 26)
- Add optional notes (e.g., "Includes Q4 performance bonus")

**Stage 2 — Process:**
- System computes payroll entries for all employees with configured salaries
- LOP (Loss of Pay) is automatically calculated from approved unpaid leaves
  - Formula: `(Gross Monthly ÷ Working Days) × LOP Days`
- Admins can edit per-employee: bonus amount and LOP days
- Net pay updates automatically on edit

**Stage 3 — Paid:**
- Admin marks run as paid after disbursement
- Run is locked (no further edits)
- Employees can view payslips

**Payroll entries table per run:**
- Employee name, department
- Gross salary, PF, PT, TDS, LOP deduction, bonus
- Net pay (prominently displayed)
- Run totals row

**Confirmation safeguards:**
- Deleting a payroll run requires confirmation (irreversible)
- Reprocessing an already-processed run warns that manual edits (bonus, LOP) will be reset

---

### Payslips

**Admin view:** All employees' payslips accessible per run

**Employee self-service:** My Payslips tab shows all processed and paid runs
- Month, gross earnings, total deductions, net pay
- Status badge: Processed (amber) or Paid (green)
- Draft runs are hidden from employee view
- Print-to-PDF via browser print dialog

**Payslip content:**
- Organization name
- Employee name, designation, department
- Pay period (month + year)
- Earnings breakdown: Basic, HRA, Special Allowance, Bonus (if any)
- Gross earnings
- Deductions: Employee PF, Professional Tax, TDS, LOP (if any)
- Total deductions
- Net Pay (take-home)
- Footer: "System-generated, no signature required"

**Limitations:**
- Payslips not emailed automatically (planned feature)
- No batch PDF download
- All employees on New Tax Regime (no old regime option)
- No ESI integration
- No salary advance or loan deduction support
- No multi-currency (INR only)

---

## JambaHire — Recruiting Suite

End-to-end Applicant Tracking System (ATS) covering the full hiring workflow: job posting, candidate pipeline, interviews, and offers.

**Plan availability:** Business plan (AI job description generator available on Growth)

---

### Jobs

Manage job openings with a full status lifecycle and public posting to your careers page.

**Job fields:**
- Title, description (rich text)
- Department, employment type (full-time, part-time, contract, intern)
- Location type (on-site, remote, hybrid) and location name
- Salary range (optional, toggle to show publicly)
- Custom application questions (per-job)

**Job status lifecycle:** Draft → Active → Paused → Closed

**Admin actions:**
- Publish/pause/close jobs
- Edit job details
- Delete job (cascades to applications)
- Share active jobs to LinkedIn (one-click)
- View application count per job

**List filters:** All, Active, Draft, Paused, Closed

**Action loading states:** All status changes and deletes show loading indicators and disable buttons during processing.

---

### Candidates

Central database of all candidates across all jobs.

**Candidate profiles:**
- Name, email, phone, LinkedIn URL
- Source: direct, referral, LinkedIn, Naukri, Indeed, other
- Resume URL
- Tags (custom labels)

**Manual candidate creation:**
- Add candidates directly without a job application (referrals, sourced profiles)
- Source tracking from URL parameter (`?source=linkedin`) for campaign attribution

**Application history per candidate:**
- All jobs they applied to with current stage
- Applied date

**Search:** By name or email

---

### Pipeline

Kanban-style pipeline board showing all active candidates across all jobs.

**Stages:** Applied → Screening → Interview 1 → Interview 2 → Final Round → Offer → Hired

**Board capabilities:**
- Drag-and-drop cards between stages
- Bulk select and move multiple candidates at once
- Filter by job, date range, or candidate name
- Show/hide rejected candidates
- Application count per stage column header

**Funnel analytics (admin):**
- Conversion rate between each stage
- Drop-off percentage per stage (e.g., 30% drop between Screening → Interview 1)
- Days-in-stage indicator per candidate

**Per-card information:**
- Candidate name
- Job title
- Days in current stage
- Interviewer feedback summary (if available)

---

### Interviews

Schedule, track, and collect structured feedback for all candidate interviews.

**Scheduling:**
- Select candidate and job
- Interview type: video, phone, in-person
- Date and time picker
- Meeting link (for video/phone)
- Assign interviewer (from employee list)
- Calendar links auto-generated: Google Calendar, Outlook, ICS download

**Interview statuses:** Scheduled → Completed / No Show / Cancelled

**Rescheduling:**
- Inline reschedule form per interview (no separate dialog required)
- Update date/time, interview type, and meeting link
- Pre-filled with current values for quick edits

**Structured feedback (interviewer):**
- All 4 rating fields are required before submission (no silent defaults)
  - Technical skills rating
  - Communication rating
  - Culture fit rating
  - Overall rating
- Recommendation: Strong Yes / Yes / No / Strong No
- Free-text notes
- Submit button disabled until all ratings are filled

**Feedback visibility:**
- Admins and hiring managers see all feedback
- Recommendations are color-coded on interview cards

---

### Offers

Generate, send, and track offer letters with a token-based accept/decline flow for candidates.

**Offer creation (admin):**
- Select candidate and application
- Role title, annual CTC, joining date
- Department and reporting manager (optional)
- Additional terms (free text)

**Offer status lifecycle:** Draft → Sent → Accepted / Declined

**Offer editing:**
- Edit any draft or sent offer (role, CTC, dates, terms)
- Candidate dropdown locked during edit (cannot reassign offer to different candidate)
- Cannot edit accepted or declined offers

**Offer deletion:**
- Delete draft or sent offers
- Cannot delete accepted or declined offers

**Candidate offer flow:**
- Admin sends offer → candidate receives email with secure link
- Offer page shows full letter at `/offers/[token]` (no login required)
- Candidate clicks Accept or Decline
- Status updates in real time
- Email CTA buttons in the offer email directly trigger accept/decline (no extra click)

**Department name:** Automatically resolved from the job's department for the offer letter.

---

### Careers Page

Public-facing job board at `/careers/[org-slug]`. No login required for job seekers.

**Page features:**
- Lists all active jobs for the organization
- Job cards: title, employment type, location, salary range (if enabled)
- Apply button per job

**Application form:**
- Name, email, phone
- LinkedIn URL
- Resume upload
- Cover note
- Custom per-job questions (answered per job posting)
- Work samples (if requested by job)

**Source tracking:**
- `?source=linkedin`, `?source=naukri`, etc. appended to careers page URL
- Source is recorded on the candidate's application automatically

**On submission:**
- Candidate record created (or matched by email if existing)
- Application created in "Applied" stage
- Candidate appears in pipeline immediately

---

## Settings & Administration

Organization configuration, team structure, and billing management.

**Organization profile (admin):**
- Edit company name
- View current plan with upgrade option

**Departments (admin):**
- Add, edit, delete departments
- Assign department head (employee selector)
- Departments used across employees, documents, payroll, and directory

**Leave policies (admin):**
- Create and configure leave types
- Set days per year, carry-forward rules
- Delete unused policies

**Feature flags (admin):**
- Enable/disable Attendance module per org
- Enable/disable Grievances module per org
- Enable/disable JambaHire (recruiting) per org

**Billing (admin):**
- View current plan tier
- Upgrade or downgrade subscription (Razorpay-powered)
- Billing history

**Plan availability:** All plans (billing features vary by tier)

---

## Cross-Cutting Capabilities

### Authentication
- Powered by Clerk with multi-tenant organization support
- Sign in with email/password or SSO (Clerk-supported providers)
- Organization-scoped sessions (users only access their org's data)
- Role stored per org membership

### Data Security
- All data isolated by `org_id` at the database layer
- Admin API client bypasses Row Level Security for server-side operations
- HTTPS-only
- No user data shared across organizations

### Email Notifications
- Leave request submitted → managers and admins notified
- Leave approved or rejected → employee notified
- Offer letter sent → candidate email with secure offer link
- New org created → welcome email + founder alert
- Document acknowledgment reminder → weekly email for unacknowledged required docs
- Onboarding nudge emails: Day 1, 3, 5 (progress prompts), Day 7 (upgrade push)
- Payment failure alerts

### UI & Experience
- Dark mode supported natively across all modules
- Mobile-responsive layouts (Tailwind CSS, flexbox/grid)
- Keyboard-accessible components (Radix UI primitives)
- Toast notifications for all actions (success and error)
- Role-aware navigation: locked items show a lock icon with upgrade prompt
- Upgrade Gate component for Growth/Business-gated features with feature highlights

### Blog & Content
- Built-in markdown blog at `/blog` (SSG at build time)
- SEO-optimized posts for organic discovery
- Categories: HR law, compliance, payroll, people management

---

## Feature Matrix

| Module | Starter | Growth | Business | Notes |
|--------|:-------:|:------:|:--------:|-------|
| Dashboard | ✅ | ✅ | ✅ | Role-aware |
| Employee Management | ✅ | ✅ | ✅ | |
| Directory & Org Chart | ✅ | ✅ | ✅ | |
| Leave Management | ✅ | ✅ | ✅ | |
| Announcements | ✅ | ✅ | ✅ | |
| Attendance Tracking | ✅* | ✅ | ✅ | *Feature flag |
| Grievances | ✅* | ✅ | ✅ | *Feature flag |
| Documents Hub | | ✅ | ✅ | Incl. acknowledgments |
| Performance Reviews | | ✅ | ✅ | |
| Objectives & OKRs | | ✅ | ✅ | |
| Training & Compliance | | ✅ | ✅ | Compliance dashboard: Business |
| AI Job Description Generator | | ✅ | ✅ | |
| Job Posting | | ✅ | ✅ | |
| Candidates (basic) | | ✅ | ✅ | |
| Full ATS (pipeline, interviews, offers) | | | ✅ | |
| Payroll & Compensation | | | ✅ | INR, Indian tax |
| Advanced Analytics | | | ✅ | |
| AI Smart Review Summaries | | | ✅ | |
| AI Attrition Risk | | | ✅ | |
| Semantic Document Search | | | ✅ | |
| Public API | | | ✅ | |

---

## Known Limitations

The following are known gaps as of the current version. Each is actively being tracked for future development.

### Data & Reporting
- No historical trend analytics or period-over-period comparison on dashboards
- No bulk CSV import for candidates or salary structures (employee import is supported)
- No export to Excel or PDF for any module other than payslips
- No global search across all modules

### Payroll
- All employees default to New Tax Regime (Old Regime not yet supported)
- No ESI (Employee State Insurance) integration
- No salary advance or loan deduction support
- Payslips not automatically emailed on pay day (manual view only)
- No batch payslip download

### Attendance
- No geolocation or IP-based clock-in verification
- No shift scheduling or roster management
- No automatic clock-out reminder
- No overtime calculation

### Reviews & OKRs
- No 360-degree or peer reviews
- No cross-cycle performance comparison
- No competency framework or skill taxonomy
- OKR hierarchy (company → team → individual) not yet supported

### Integrations
- No HRMS data import from BambooHR, Darwinbox, Keka, or similar
- LMS auto-sync (Coursera, LinkedIn Learning, TalentLMS) is planned but not yet available
- No Slack or Teams notifications
- No payroll export to accounting software (Tally, Zoho Books)

### Compliance
- No Form 16 generation
- No EPF ECR (Electronic Challan cum Return) export
- No statutory compliance calendar or alerts for filing deadlines

---

*This document reflects the feature set as of April 2026. JambaHR is actively developed — features marked as "planned" or "coming soon" are on the roadmap.*
