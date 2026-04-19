# Super Admin Panel — Design Spec
**Date:** 2026-04-19  
**Status:** Approved

---

## Overview

A password-protected internal admin panel at `/superadmin` inside the existing JambaHR Next.js app. Gives the founder visibility into all signups, plan distribution, and upsell targets — without any separate deployment or new auth system.

**Scope (v1):** Data viewing only. Email/outreach actions are out of scope for this version.

---

## Authentication

- Single-password gate using an `SUPERADMIN_SECRET` env var
- `POST /api/superadmin/login` — validates password, sets an httpOnly cookie `superadmin_session` (value = the secret, 30-day expiry)
- `GET /api/superadmin/logout` — clears the cookie, redirects to `/superadmin/login`
- Middleware extends existing `middleware.ts`: any request to `/superadmin/*` (except `/superadmin/login`) checks for valid `superadmin_session` cookie; if missing/invalid → redirect to `/superadmin/login`
- No Clerk involvement. No database session storage. Stateless cookie check.

---

## Pages

### `/superadmin/login`
- Bare layout (no sidebar, no header)
- Single password field + submit button
- On success: redirect to `/superadmin/dashboard`
- On failure: inline error "Incorrect password"

### `/superadmin/dashboard`
- Server component — fetches all data at render time via Supabase admin client
- Three sections rendered top to bottom: Stats Bar → All Signups → Upsell Targets

---

## Data Sections

### 1. Stats Bar
Six stat cards in a row:

| Card | Value |
|------|-------|
| Total Orgs | COUNT of all organizations |
| Starter | COUNT where plan = 'starter' |
| Growth | COUNT where plan = 'growth' |
| Business | COUNT where plan = 'business' |
| Signups This Week | COUNT where created_at >= 7 days ago |
| Signups This Month | COUNT where created_at >= 30 days ago |

### 2. All Signups Table
Sorted by `created_at DESC` (newest first). Shows every org.

| Column | Source |
|--------|--------|
| Company | `organizations.name` |
| Owner Email | looked up from `employees` where `clerk_user_id` matches org creator — falls back to "—" if not linked yet |
| Industry | `organizations.settings->>'industry'` (set during onboarding) |
| Team Size (declared) | `organizations.settings->>'companySize'` (from onboarding) |
| Plan | `organizations.plan` — shown as a badge (Starter / Growth / Business) |
| Employees Added | COUNT of active employees in `employees` table for this org |
| Signed Up | `organizations.created_at` formatted as "Apr 17, 2026" |

### 3. Upsell Targets Table
Same columns as All Signups. Filtered to starter orgs that meet either condition:

- **Hot lead:** `employee_count >= 7` (70%+ of 10-employee starter limit — approaching paywall)
- **Warm lead:** plan = 'starter' AND `created_at <= 30 days ago` AND `employee_count >= 3` (engaged, been around a while, not converted)

Sorted by `employee_count DESC` (highest utilisation first).

A small label on each row indicates why they appear: "Near limit" or "Engaged starter".

---

## Data Fetching

All data fetched server-side using `createAdminSupabase()` (bypasses RLS). One query for orgs with employee counts:

```sql
SELECT
  o.id, o.name, o.plan, o.settings, o.created_at,
  COUNT(e.id) FILTER (WHERE e.status = 'active') AS employee_count
FROM organizations o
LEFT JOIN employees e ON e.org_id = o.id
GROUP BY o.id
ORDER BY o.created_at DESC
```

Owner email resolved by a second query joining `employees` where `clerk_user_id IS NOT NULL` and role = 'owner' or the first admin record per org.

---

## File Structure

```
src/app/superadmin/
  layout.tsx                  — bare layout (no Clerk, no sidebar)
  login/page.tsx              — password form (client component for form state)
  dashboard/page.tsx          — server component, three sections
src/app/api/superadmin/
  login/route.ts              — POST: validates password, sets cookie
  logout/route.ts             — GET: clears cookie, redirects
src/components/superadmin/
  stats-bar.tsx               — six stat cards
  signups-table.tsx           — all signups table
  upsell-targets-table.tsx    — filtered upsell targets table
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `SUPERADMIN_SECRET` | Password for the admin panel. Add to `.env.local` and Vercel env vars. |

---

## Middleware Changes

Add to existing `src/middleware.ts` public routes exception: `/superadmin/login` stays public. All other `/superadmin/*` routes check for `superadmin_session` cookie matching `SUPERADMIN_SECRET`. If invalid → redirect to `/superadmin/login`.

Clerk's `authMiddleware` must NOT run on `/superadmin/*` routes — these are outside the Clerk tenant model entirely.

---

## Out of Scope (v1)

- Sending emails or triggering outreach from the panel
- Editing org plans from the panel
- Impersonating users
- Per-org drill-down pages
- Export to CSV (can be added later)
