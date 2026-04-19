# Superadmin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a password-protected internal admin panel at `/superadmin` giving the founder a real-time view of all signups, plan distribution, and upsell targets — using only data already in Supabase.

**Architecture:** Hidden route group inside the existing Next.js app. Auth is a stateless httpOnly cookie checked in `clerkMiddleware`'s callback before any Clerk logic runs. All data fetched server-side via the existing `createAdminSupabase()` admin client. No new tables, no new auth system.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, Supabase admin client, `@clerk/nextjs/server` clerkMiddleware

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/middleware.ts` | Intercept `/superadmin/*` before Clerk, check cookie |
| Create | `src/app/api/superadmin/login/route.ts` | POST: validate password, set cookie |
| Create | `src/app/api/superadmin/logout/route.ts` | POST: clear cookie, redirect |
| Create | `src/app/superadmin/layout.tsx` | Bare layout (no Clerk, no sidebar) |
| Create | `src/app/superadmin/page.tsx` | Redirect to `/superadmin/dashboard` |
| Create | `src/app/superadmin/login/page.tsx` | Password form (client component) |
| Create | `src/app/superadmin/dashboard/page.tsx` | Server component — fetches data, renders sections |
| Create | `src/lib/superadmin-data.ts` | Data fetching helpers — typed, isolated from UI |
| Create | `src/components/superadmin/stats-bar.tsx` | Six stat cards |
| Create | `src/components/superadmin/signups-table.tsx` | All orgs table |
| Create | `src/components/superadmin/upsell-targets-table.tsx` | Filtered upsell targets |

---

## Task 1: Environment variable + middleware

**Files:**
- Modify: `.env.local`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add SUPERADMIN_SECRET to .env.local**

Open `.env.local` and add this line (choose a strong password):
```
SUPERADMIN_SECRET=your-strong-password-here
```

- [ ] **Step 2: Update middleware to intercept /superadmin routes**

Replace the contents of `src/middleware.ts` with:

```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/careers(.*)",
  "/offers(.*)",
  "/blog(.*)",
  "/pricing",
]);

const isSuperadminPublic = createRouteMatcher([
  "/superadmin/login",
  "/api/superadmin/login",
]);

export default clerkMiddleware((auth, request) => {
  const { pathname } = request.nextUrl;

  // Superadmin routes bypass Clerk auth entirely
  if (pathname.startsWith("/superadmin") || pathname.startsWith("/api/superadmin")) {
    // Login page and login API are always public
    if (isSuperadminPublic(request)) {
      return NextResponse.next();
    }
    // All other superadmin routes require the session cookie
    const cookie = request.cookies.get("superadmin_session");
    const secret = process.env.SUPERADMIN_SECRET;
    if (!secret || cookie?.value !== secret) {
      return NextResponse.redirect(new URL("/superadmin/login", request.url));
    }
    return NextResponse.next();
  }

  // Existing Clerk logic
  const { userId } = auth();
  if (userId && (pathname === "/" || pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up"))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (!isPublicRoute(request)) {
    auth().protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 3: Verify the build still passes**

```bash
npm run build
```

Expected: build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(superadmin): protect /superadmin routes via cookie middleware"
```

---

## Task 2: Login and logout API routes

**Files:**
- Create: `src/app/api/superadmin/login/route.ts`
- Create: `src/app/api/superadmin/logout/route.ts`

- [ ] **Step 1: Create the login route**

Create `src/app/api/superadmin/login/route.ts`:

```typescript
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { password } = await req.json();
  const secret = process.env.SUPERADMIN_SECRET;

  if (!secret || password !== secret) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("superadmin_session", secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return response;
}
```

- [ ] **Step 2: Create the logout route**

Create `src/app/api/superadmin/logout/route.ts`:

```typescript
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.redirect(
    new URL("/superadmin/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
  );
  response.cookies.set("superadmin_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/superadmin/
git commit -m "feat(superadmin): add login/logout API routes"
```

---

## Task 3: Superadmin layout, root redirect, and login page

**Files:**
- Create: `src/app/superadmin/layout.tsx`
- Create: `src/app/superadmin/page.tsx`
- Create: `src/app/superadmin/login/page.tsx`

- [ ] **Step 1: Create the bare layout**

Create `src/app/superadmin/layout.tsx`:

```typescript
export default function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Create root redirect**

Create `src/app/superadmin/page.tsx`:

```typescript
import { redirect } from "next/navigation";

export default function SuperadminRoot() {
  redirect("/superadmin/dashboard");
}
```

- [ ] **Step 3: Create the login page**

Create `src/app/superadmin/login/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SuperadminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/superadmin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/superadmin/dashboard");
    } else {
      setError("Incorrect password");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">JambaHR Admin</h1>
          <p className="mt-1 text-sm text-gray-500">Internal use only.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? "Checking..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/superadmin/
git commit -m "feat(superadmin): add layout, root redirect, and login page"
```

---

## Task 4: Data fetching helper

**Files:**
- Create: `src/lib/superadmin-data.ts`

- [ ] **Step 1: Create the data helper**

Create `src/lib/superadmin-data.ts`:

```typescript
import { createAdminSupabase } from "@/lib/supabase/server";

export type OrgWithStats = {
  id: string;
  name: string;
  plan: "starter" | "growth" | "business";
  created_at: string;
  employee_count: number;
  owner_email: string | null;
};

export type SuperadminStats = {
  total: number;
  starter: number;
  growth: number;
  business: number;
  signupsThisWeek: number;
  signupsThisMonth: number;
};

export type UpsellReason = "near_limit" | "engaged_starter";

export type UpsellTarget = OrgWithStats & { reason: UpsellReason };

export async function getAllOrgsWithStats(): Promise<OrgWithStats[]> {
  const supabase = createAdminSupabase();

  // Fetch all orgs
  const { data: orgs, error: orgsError } = await supabase
    .from("organizations")
    .select("id, name, plan, created_at")
    .order("created_at", { ascending: false });

  if (orgsError || !orgs) return [];

  const orgIds = orgs.map((o) => o.id);

  // Fetch active employee counts per org
  const { data: employees } = await supabase
    .from("employees")
    .select("org_id")
    .eq("status", "active")
    .in("org_id", orgIds);

  // Fetch one owner/admin email per org (earliest created)
  const { data: adminEmployees } = await supabase
    .from("employees")
    .select("org_id, email, role, created_at")
    .in("role", ["owner", "admin"])
    .in("org_id", orgIds)
    .order("created_at", { ascending: true });

  // Build lookup maps
  const empCountMap: Record<string, number> = {};
  for (const emp of employees ?? []) {
    empCountMap[emp.org_id] = (empCountMap[emp.org_id] ?? 0) + 1;
  }

  const ownerEmailMap: Record<string, string> = {};
  for (const emp of adminEmployees ?? []) {
    if (!ownerEmailMap[emp.org_id]) {
      ownerEmailMap[emp.org_id] = emp.email;
    }
  }

  return orgs.map((org) => ({
    id: org.id,
    name: org.name,
    plan: org.plan as OrgWithStats["plan"],
    created_at: org.created_at,
    employee_count: empCountMap[org.id] ?? 0,
    owner_email: ownerEmailMap[org.id] ?? null,
  }));
}

export function computeStats(orgs: OrgWithStats[]): SuperadminStats {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    total: orgs.length,
    starter: orgs.filter((o) => o.plan === "starter").length,
    growth: orgs.filter((o) => o.plan === "growth").length,
    business: orgs.filter((o) => o.plan === "business").length,
    signupsThisWeek: orgs.filter((o) => new Date(o.created_at) >= weekAgo).length,
    signupsThisMonth: orgs.filter((o) => new Date(o.created_at) >= monthAgo).length,
  };
}

export function getUpsellTargets(orgs: OrgWithStats[]): UpsellTarget[] {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const targets: UpsellTarget[] = [];

  for (const org of orgs) {
    if (org.plan !== "starter") continue;

    if (org.employee_count >= 7) {
      targets.push({ ...org, reason: "near_limit" });
    } else if (
      org.employee_count >= 3 &&
      new Date(org.created_at) <= thirtyDaysAgo
    ) {
      targets.push({ ...org, reason: "engaged_starter" });
    }
  }

  // Sort by employee_count descending
  return targets.sort((a, b) => b.employee_count - a.employee_count);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/superadmin-data.ts
git commit -m "feat(superadmin): add data fetching helpers with OrgWithStats types"
```

---

## Task 5: Stats bar component

**Files:**
- Create: `src/components/superadmin/stats-bar.tsx`

- [ ] **Step 1: Create the stats bar**

Create `src/components/superadmin/stats-bar.tsx`:

```typescript
import type { SuperadminStats } from "@/lib/superadmin-data";

const cards: { label: string; key: keyof SuperadminStats }[] = [
  { label: "Total Orgs", key: "total" },
  { label: "Starter", key: "starter" },
  { label: "Growth", key: "growth" },
  { label: "Business", key: "business" },
  { label: "This Week", key: "signupsThisWeek" },
  { label: "This Month", key: "signupsThisMonth" },
];

export function StatsBar({ stats }: { stats: SuperadminStats }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map(({ label, key }) => (
        <div
          key={key}
          className="rounded-lg border border-gray-200 bg-white px-4 py-5 shadow-sm"
        >
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">
            {stats[key]}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/superadmin/stats-bar.tsx
git commit -m "feat(superadmin): add StatsBar component"
```

---

## Task 6: Signups table component

**Files:**
- Create: `src/components/superadmin/signups-table.tsx`

- [ ] **Step 1: Create the signups table**

Create `src/components/superadmin/signups-table.tsx`:

```typescript
import type { OrgWithStats } from "@/lib/superadmin-data";

const PLAN_STYLES: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700",
  growth: "bg-blue-100 text-blue-700",
  business: "bg-teal-100 text-teal-700",
};

function PlanBadge({ plan }: { plan: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${PLAN_STYLES[plan] ?? "bg-gray-100 text-gray-700"}`}
    >
      {plan}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function SignupsTable({ orgs }: { orgs: OrgWithStats[] }) {
  if (orgs.length === 0) {
    return <p className="text-sm text-gray-500">No signups yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {["Company", "Owner Email", "Plan", "Employees", "Signed Up"].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orgs.map((org) => (
            <tr key={org.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{org.name}</td>
              <td className="px-4 py-3 text-gray-600">
                {org.owner_email ?? <span className="text-gray-400">—</span>}
              </td>
              <td className="px-4 py-3">
                <PlanBadge plan={org.plan} />
              </td>
              <td className="px-4 py-3 text-gray-700">{org.employee_count}</td>
              <td className="px-4 py-3 text-gray-500">{formatDate(org.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/superadmin/signups-table.tsx
git commit -m "feat(superadmin): add SignupsTable component"
```

---

## Task 7: Upsell targets table component

**Files:**
- Create: `src/components/superadmin/upsell-targets-table.tsx`

- [ ] **Step 1: Create the upsell targets table**

Create `src/components/superadmin/upsell-targets-table.tsx`:

```typescript
import type { UpsellTarget } from "@/lib/superadmin-data";

const REASON_LABELS: Record<string, { label: string; style: string }> = {
  near_limit: {
    label: "Near limit",
    style: "bg-red-100 text-red-700",
  },
  engaged_starter: {
    label: "Engaged starter",
    style: "bg-amber-100 text-amber-700",
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function UpsellTargetsTable({ targets }: { targets: UpsellTarget[] }) {
  if (targets.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No upsell targets right now. Great news — no one is near their limit.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {["Company", "Owner Email", "Employees / 10", "Signed Up", "Signal"].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {targets.map((org) => {
            const { label, style } = REASON_LABELS[org.reason];
            const pct = Math.round((org.employee_count / 10) * 100);
            return (
              <tr key={org.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{org.name}</td>
                <td className="px-4 py-3 text-gray-600">
                  {org.owner_email ?? <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className="text-gray-700">
                      {org.employee_count} / 10
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{formatDate(org.created_at)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
                  >
                    {label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/superadmin/upsell-targets-table.tsx
git commit -m "feat(superadmin): add UpsellTargetsTable component"
```

---

## Task 8: Dashboard page + logout button

**Files:**
- Create: `src/app/superadmin/dashboard/page.tsx`

- [ ] **Step 1: Create the dashboard page**

Create `src/app/superadmin/dashboard/page.tsx`:

```typescript
import { getAllOrgsWithStats, computeStats, getUpsellTargets } from "@/lib/superadmin-data";
import { StatsBar } from "@/components/superadmin/stats-bar";
import { SignupsTable } from "@/components/superadmin/signups-table";
import { UpsellTargetsTable } from "@/components/superadmin/upsell-targets-table";

export const dynamic = "force-dynamic";

async function LogoutButton() {
  return (
    <form action="/api/superadmin/logout" method="POST">
      <button
        type="submit"
        className="text-sm text-gray-500 hover:text-gray-700 underline"
      >
        Sign out
      </button>
    </form>
  );
}

export default async function SuperadminDashboard() {
  const orgs = await getAllOrgsWithStats();
  const stats = computeStats(orgs);
  const upsellTargets = getUpsellTargets(orgs);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">JambaHR Admin</h1>
            <p className="text-sm text-gray-500">Internal analytics — not customer-facing</p>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-6 py-8">
        {/* Stats */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Overview
          </h2>
          <StatsBar stats={stats} />
        </section>

        {/* Upsell targets */}
        <section>
          <h2 className="mb-1 text-base font-semibold text-gray-900">
            Upsell Targets
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            Starter orgs with ≥7 employees (near limit) or ≥3 employees and 30+ days old (engaged, not converted).
          </p>
          <UpsellTargetsTable targets={upsellTargets} />
        </section>

        {/* All signups */}
        <section>
          <h2 className="mb-1 text-base font-semibold text-gray-900">
            All Signups
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            {orgs.length} total org{orgs.length !== 1 ? "s" : ""} — newest first.
          </p>
          <SignupsTable orgs={orgs} />
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build passes**

```bash
npm run build
```

Expected: build completes without TypeScript errors.

- [ ] **Step 3: Smoke test locally**

```bash
npm run dev
```

1. Open `http://localhost:3000/superadmin` — should redirect to `/superadmin/login`
2. Enter wrong password — should show "Incorrect password"
3. Enter correct password (value of `SUPERADMIN_SECRET` in `.env.local`) — should redirect to `/superadmin/dashboard`
4. Dashboard should load with stats bar, upsell targets section, and all signups table
5. Sign out link should clear session and redirect to login
6. Navigate to `http://localhost:3000/dashboard` — should still require Clerk auth as normal

- [ ] **Step 4: Add SUPERADMIN_SECRET to Vercel**

In Vercel Dashboard → Project → Settings → Environment Variables:
- Key: `SUPERADMIN_SECRET`
- Value: same strong password used in `.env.local`
- Environment: Production + Preview

- [ ] **Step 5: Commit and push**

```bash
git add src/app/superadmin/dashboard/ src/app/superadmin/page.tsx
git commit -m "feat(superadmin): add dashboard page with stats, signups, and upsell targets"
git push
```
