# Privacy + Terms + Cookie Consent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship public `/privacy` and `/terms` pages, gate analytics behind a cookie banner for anonymous visitors, and require recorded consent at the final step of org onboarding.

**Architecture:** Three independent surfaces. (1) Static legal pages render markdown converted from `.docx` via a one-shot `mammoth` script, served through the same `gray-matter + remark` pipeline used by the blog. (2) A localStorage-backed cookie banner gates `posthog.init()` until the visitor accepts. (3) A required checkbox at onboarding step 2 records `privacy_policy_accepted_at`, `terms_accepted_at`, and `policy_version_accepted` on the `organizations` row.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind, Clerk, Supabase, mammoth (devDep), gray-matter + remark + remark-html + remark-gfm, posthog-js.

**Spec:** See `docs/superpowers/specs/2026-05-01-privacy-terms-cookie-consent-design.md` for full design rationale.

**Testing posture:** This project has no Jest/Vitest setup. Each task ends with manual verification (curl, browser inspection, or `npm run build`) plus a git commit. Treat verification steps as the equivalent of test runs.

---

## Task 1: Install mammoth and write the .docx → markdown conversion script

**Files:**
- Modify: `package.json` (add `mammoth` to `devDependencies` + `convert-legal` script)
- Create: `scripts/convert-legal-docs.js`

- [ ] **Step 1: Install mammoth as a devDependency**

```bash
npm install --save-dev mammoth
```

Expected: `mammoth` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Add the convert-legal script entry to package.json**

In `package.json`, inside the `"scripts"` object, add this line (the `,` placement depends on adjacent entries):

```json
"convert-legal": "node scripts/convert-legal-docs.js"
```

- [ ] **Step 3: Create the conversion script**

Create `scripts/convert-legal-docs.js` with this exact content:

```js
/* eslint-disable @typescript-eslint/no-var-requires */
const mammoth = require("mammoth");
const fs = require("fs");
const path = require("path");

const VERSION = "2026-05-01";
const OUT_DIR = path.join(process.cwd(), "src/content/legal");
const SRC_DIR = path.join(process.cwd(), "sample-documents/policy");

const SOURCES = [
  { docx: "JambaHR_Privacy_Policy.docx", slug: "privacy", title: "Privacy Policy" },
  { docx: "TERMS OF SERVICE.docx",       slug: "terms",   title: "Terms of Service" },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const s of SOURCES) {
    const input = path.join(SRC_DIR, s.docx);
    if (!fs.existsSync(input)) {
      console.error(`Source missing: ${input}`);
      process.exit(1);
    }
    const { value: markdown, messages } = await mammoth.convertToMarkdown({ path: input });
    if (messages.length) {
      console.warn(`Warnings for ${s.docx}:`, messages.map((m) => m.message).join("; "));
    }
    const frontmatter =
      `---\n` +
      `title: ${s.title}\n` +
      `slug: ${s.slug}\n` +
      `effective: ${VERSION}\n` +
      `version: ${VERSION}\n` +
      `---\n\n`;
    const outPath = path.join(OUT_DIR, `${s.slug}.md`);
    fs.writeFileSync(outPath, frontmatter + markdown);
    console.log(`Wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Close any open Word lockfiles before running**

Word's lockfiles (`~$JambaHR_Privacy_Policy.docx`, `~$TERMS OF SERVICE.docx`) indicate the docs are open. Close them in Word so mammoth can read the source files cleanly.

- [ ] **Step 5: Run the conversion**

```bash
npm run convert-legal
```

Expected output:
```
Wrote .../src/content/legal/privacy.md
Wrote .../src/content/legal/terms.md
```

May print mammoth warnings about unsupported Word styles — these are advisory, not failures.

- [ ] **Step 6: Inspect the generated markdown for fidelity issues**

```bash
ls src/content/legal/
```

Open `src/content/legal/privacy.md` and `src/content/legal/terms.md`. Verify the heading structure (`#`, `##`) survived, paragraphs are readable, and there are no obvious garbage characters. If a section came out badly, hand-edit the markdown — these files are now the source of truth.

Confirm the Privacy Policy contains a heading whose text contains the word "Cookies" (used by the banner deep-link `/privacy#cookies`). If absent, add a `## Cookies` section by hand summarizing how the site uses cookies.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/convert-legal-docs.js src/content/legal/privacy.md src/content/legal/terms.md
git commit -m "feat(legal): add mammoth-based .docx → markdown conversion + generated privacy/terms"
```

---

## Task 2: Create the LATEST_POLICY_VERSION config and the legal rendering library

**Files:**
- Create: `src/config/legal.ts`
- Create: `src/lib/legal.ts`

- [ ] **Step 1: Create the version config**

Create `src/config/legal.ts`:

```ts
export const LATEST_POLICY_VERSION = "2026-05-01";

export const LEGAL_SLUGS = ["privacy", "terms"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];
```

The constant must match the `VERSION` value in `scripts/convert-legal-docs.js`. If you bump the version, bump it in both places.

- [ ] **Step 2: Create the rendering library**

Create `src/lib/legal.ts` (mirrors `src/lib/blog.ts`):

```ts
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";
import remarkGfm from "remark-gfm";
import type { LegalSlug } from "@/config/legal";

const LEGAL_DIR = path.join(process.cwd(), "src/content/legal");

export type LegalDoc = {
  slug: LegalSlug;
  title: string;
  effective: string;
  version: string;
  content: string;
};

export async function getLegalDoc(slug: LegalSlug): Promise<LegalDoc | null> {
  const filePath = path.join(LEGAL_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  const processed = await remark()
    .use(remarkGfm)
    .use(html, { sanitize: false })
    .process(content);

  return {
    slug,
    title: data.title ?? "",
    effective: data.effective ?? "",
    version: data.version ?? "",
    content: processed.toString(),
  };
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors. (The project has `ignoreBuildErrors: true` in `next.config.js`, but `tsc --noEmit` will still flag type problems for you to see.)

- [ ] **Step 4: Commit**

```bash
git add src/config/legal.ts src/lib/legal.ts
git commit -m "feat(legal): add LATEST_POLICY_VERSION config and getLegalDoc rendering library"
```

---

## Task 3: Create /privacy and /terms pages

**Files:**
- Create: `src/app/privacy/page.tsx`
- Create: `src/app/terms/page.tsx`

- [ ] **Step 1: Create the privacy page**

Create `src/app/privacy/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getLegalDoc } from "@/lib/legal";

export const dynamic = "force-static";

export const metadata = {
  title: "Privacy Policy",
  description: "How JambaHR collects, uses, and protects your data.",
};

export default async function PrivacyPage() {
  const doc = await getLegalDoc("privacy");
  if (!doc) notFound();

  return (
    <main className="min-h-screen bg-white dark:bg-[#0a0a0f]">
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-white/80 dark:bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Image src="/Jamba.png" alt="JambaHR" width={30} height={30} className="rounded-md" />
            <span><span className="text-primary">Jamba</span>HR</span>
          </Link>
        </div>
      </nav>
      <article className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective {doc.effective}</p>
        <div
          className="prose prose-neutral dark:prose-invert mt-10 max-w-none"
          dangerouslySetInnerHTML={{ __html: doc.content }}
        />
      </article>
    </main>
  );
}
```

- [ ] **Step 2: Create the terms page**

Create `src/app/terms/page.tsx` with the same shape as `privacy/page.tsx` but pointing at `"terms"`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getLegalDoc } from "@/lib/legal";

export const dynamic = "force-static";

export const metadata = {
  title: "Terms of Service",
  description: "The terms governing your use of JambaHR.",
};

export default async function TermsPage() {
  const doc = await getLegalDoc("terms");
  if (!doc) notFound();

  return (
    <main className="min-h-screen bg-white dark:bg-[#0a0a0f]">
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-white/80 dark:bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Image src="/Jamba.png" alt="JambaHR" width={30} height={30} className="rounded-md" />
            <span><span className="text-primary">Jamba</span>HR</span>
          </Link>
        </div>
      </nav>
      <article className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective {doc.effective}</p>
        <div
          className="prose prose-neutral dark:prose-invert mt-10 max-w-none"
          dangerouslySetInnerHTML={{ __html: doc.content }}
        />
      </article>
    </main>
  );
}
```

- [ ] **Step 3: Verify with build**

```bash
npm run build
```

Expected: build succeeds. Output should list `/privacy` and `/terms` as static (`○`) routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/privacy/page.tsx src/app/terms/page.tsx
git commit -m "feat(legal): add /privacy and /terms public pages"
```

---

## Task 4: Make /privacy and /terms public in Clerk middleware

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add the routes to isPublicRoute**

Edit `src/middleware.ts`. Find the `isPublicRoute` matcher (already includes `/sitemap.xml` and `/robots.txt` from a prior change) and add the two legal routes:

```ts
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/careers(.*)",
  "/offers(.*)",
  "/blog(.*)",
  "/pricing",
  "/api/attendance/punch",
  "/sitemap.xml",
  "/robots.txt",
  "/privacy",
  "/terms",
]);
```

- [ ] **Step 2: Run dev server and verify**

```bash
npm run dev
```

Open `http://localhost:3000/privacy` in a private browser window (no Clerk session). Expected: the rendered Privacy Policy page loads. Try `/terms`. Both should render without redirecting to sign-in.

Stop the dev server (`Ctrl+C`) when done.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(legal): allow /privacy and /terms as public routes"
```

---

## Task 5: Add /privacy and /terms to the sitemap

**Files:**
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1: Add the two static entries**

Edit `src/app/sitemap.ts`. Inside the returned array, add two entries alongside the existing homepage and blog entries:

```ts
{
  url: `${BASE_URL}/privacy`,
  lastModified: new Date(),
  changeFrequency: "yearly",
  priority: 0.5,
},
{
  url: `${BASE_URL}/terms`,
  lastModified: new Date(),
  changeFrequency: "yearly",
  priority: 0.5,
},
```

Place them after the `/blog` entry and before the spread of `blogUrls`.

- [ ] **Step 2: Verify with build + curl**

```bash
npm run build
npm run start &
sleep 3
curl -s http://localhost:3000/sitemap.xml | grep -E "privacy|terms"
```

Expected: two `<url>` blocks containing `https://jambahr.com/privacy` and `https://jambahr.com/terms`. Stop the server (`kill %1` or close the terminal).

- [ ] **Step 3: Commit**

```bash
git add src/app/sitemap.ts
git commit -m "feat(seo): add /privacy and /terms to sitemap"
```

---

## Task 6: Run the SQL migration to add consent columns to organizations

**Files:**
- No code changes. This task runs SQL on the live Supabase project.

- [ ] **Step 1: Open the Supabase SQL Editor**

Go to the Supabase Dashboard for the JambaHR project (`imjwqktxzahhnfmfbtfc`). Navigate to **SQL Editor → New query**.

- [ ] **Step 2: Run this SQL**

```sql
alter table organizations
  add column if not exists privacy_policy_accepted_at timestamptz,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists policy_version_accepted text;
```

Click **Run**. Expected: `Success. No rows returned.`

- [ ] **Step 3: Verify the columns exist**

In a new query:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'organizations'
  and column_name in ('privacy_policy_accepted_at', 'terms_accepted_at', 'policy_version_accepted');
```

Expected: three rows returned, all with `is_nullable = YES`.

- [ ] **Step 4: No commit (DB-only change)**

There is nothing to commit for this task — the SQL was run directly against Supabase. Note in your worklog that the migration is applied so subsequent tasks know they can write to these columns.

---

## Task 7: Update syncOrgToSupabase to accept and persist consent fields

**Files:**
- Modify: `src/actions/organizations.ts`

- [ ] **Step 1: Replace the action signature and body**

Replace the entire content of `src/actions/organizations.ts` with:

```ts
"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import type { ActionResult } from "@/types";

export async function syncOrgToSupabase(data: {
  clerkOrgId: string;
  name: string;
  privacyAcceptedAt: string;
  termsAcceptedAt: string;
  policyVersionAccepted: string;
}): Promise<ActionResult<void>> {
  const { userId } = auth();
  if (!userId) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { error } = await supabase.from("organizations").upsert(
    {
      clerk_org_id: data.clerkOrgId,
      name: data.name,
      slug: slugify(data.name),
      plan: "starter",
      max_employees: 10,
      settings: {},
      privacy_policy_accepted_at: data.privacyAcceptedAt,
      terms_accepted_at: data.termsAcceptedAt,
      policy_version_accepted: data.policyVersionAccepted,
    },
    { onConflict: "clerk_org_id" }
  );

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}
```

The three new fields are required (not optional) — the only caller is the onboarding page, which will pass them in Task 8.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: a TypeScript error in `src/app/onboarding/page.tsx` because the existing call site does not pass the three new fields. This is expected and will be fixed in Task 8.

- [ ] **Step 3: No commit yet**

Do not commit. The action is now stricter than its caller. We commit after Task 8 makes them consistent.

---

## Task 8: Add consent checkbox to onboarding step 2 and pass the timestamps

**Files:**
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Import the version constant**

At the top of `src/app/onboarding/page.tsx`, add:

```ts
import Link from "next/link";
import { LATEST_POLICY_VERSION } from "@/config/legal";
```

- [ ] **Step 2: Add accepted state**

Inside the component, alongside the existing `useState` calls, add:

```tsx
const [accepted, setAccepted] = useState(false);
```

- [ ] **Step 3: Update handleSubmit to send consent fields**

Replace the existing `syncOrgToSupabase({ clerkOrgId: org.id, name: form.companyName })` call with:

```tsx
const now = new Date().toISOString();
const result = await syncOrgToSupabase({
  clerkOrgId: org.id,
  name: form.companyName,
  privacyAcceptedAt: now,
  termsAcceptedAt: now,
  policyVersionAccepted: LATEST_POLICY_VERSION,
});
```

Also add a guard at the top of `handleSubmit` (just after `if (!createOrganization || !setActive)`):

```tsx
if (!accepted) {
  toast.error("Please accept the Privacy Policy and Terms of Service.");
  return;
}
```

- [ ] **Step 4: Render the checkbox above the Launch button**

In the `step === 2` block, find the `<div className="flex gap-3">` that contains the Back and Launch buttons. Insert this **above** that div:

```tsx
<label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
  <input
    type="checkbox"
    checked={accepted}
    onChange={(e) => setAccepted(e.target.checked)}
    className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
  />
  <span className="text-muted-foreground">
    I agree to the{" "}
    <Link href="/privacy" target="_blank" className="text-primary underline-offset-4 hover:underline">
      Privacy Policy
    </Link>{" "}
    and{" "}
    <Link href="/terms" target="_blank" className="text-primary underline-offset-4 hover:underline">
      Terms of Service
    </Link>
    .
  </span>
</label>
```

- [ ] **Step 5: Disable the Launch button until accepted**

Find the Launch button inside `step === 2`:

```tsx
disabled={!form.companySize || loading}
```

Change to:

```tsx
disabled={!form.companySize || !accepted || loading}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors related to `syncOrgToSupabase` or `onboarding/page.tsx`.

- [ ] **Step 7: Manual verification**

```bash
npm run dev
```

In a fresh browser session, sign up a brand new test user, walk through onboarding to step 2. Verify:
1. The checkbox renders below the team-size grid.
2. The Launch button is disabled until the checkbox is checked.
3. Clicking the Privacy Policy / Terms of Service links opens those pages in a new tab.
4. Clicking Launch with the checkbox checked completes onboarding and lands on `/dashboard`.

Then in the Supabase Dashboard, run:

```sql
select clerk_org_id, name, privacy_policy_accepted_at, terms_accepted_at, policy_version_accepted
from organizations
order by created_at desc
limit 1;
```

Expected: the most recently created org row has all three new fields populated, with the version matching `2026-05-01`.

Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/actions/organizations.ts src/app/onboarding/page.tsx
git commit -m "feat(onboarding): require recorded consent for Privacy + Terms before org creation"
```

---

## Task 9: Build the cookie banner component

**Files:**
- Create: `src/components/layout/cookie-banner.tsx`

- [ ] **Step 1: Create the banner component**

Create `src/components/layout/cookie-banner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "jambahr-cookie-consent";

type Decision = "accepted" | "rejected";

function readDecision(): Decision | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "accepted" || v === "rejected" ? v : null;
}

export function openCookieSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("jambahr:open-cookie-settings"));
}

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (readDecision() === null) setShow(true);
    const onOpen = () => setShow(true);
    window.addEventListener("jambahr:open-cookie-settings", onOpen);
    return () => window.removeEventListener("jambahr:open-cookie-settings", onOpen);
  }, []);

  const decide = (decision: Decision) => {
    window.localStorage.setItem(STORAGE_KEY, decision);
    window.dispatchEvent(new CustomEvent("jambahr:consent-changed", { detail: decision }));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-2xl border border-border bg-white shadow-lg dark:bg-[#111118] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6">
        <p className="text-sm text-muted-foreground leading-relaxed flex-1">
          We use cookies for analytics. By clicking Accept, you agree to our{" "}
          <Link href="/privacy" className="text-primary underline-offset-4 hover:underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/privacy#cookies" className="text-primary underline-offset-4 hover:underline">
            Cookie Policy
          </Link>
          .
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => decide("rejected")}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted transition-colors"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => decide("accepted")}
            className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
```

The component is self-contained, exports the `CookieBanner` to mount in the layout, and exports `openCookieSettings()` for the footer button to call.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/cookie-banner.tsx
git commit -m "feat(consent): add CookieBanner component with accept/reject + reopen event"
```

---

## Task 10: Gate PostHog initialization on consent

**Files:**
- Modify: `src/components/layout/posthog-provider.tsx`

- [ ] **Step 1: Replace the provider to read consent before init**

Replace the entire content of `src/components/layout/posthog-provider.tsx` with:

```tsx
"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const STORAGE_KEY = "jambahr-cookie-consent";

function PageviewTracker({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialized = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
    posthog.capture("$pageview", { $current_url: window.location.origin + url });
  }, [pathname, searchParams, enabled]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [accepted, setAccepted] = useState(false);
  const initRan = useRef(false);

  useEffect(() => {
    const tryInit = () => {
      if (initRan.current) return;
      if (typeof window === "undefined") return;
      const consent = window.localStorage.getItem(STORAGE_KEY);
      if (consent !== "accepted") {
        setAccepted(false);
        return;
      }
      const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
      if (!key) return;
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: true,
        capture_pageleave: true,
      });
      initRan.current = true;
      setAccepted(true);
    };

    tryInit();
    const handler = () => tryInit();
    window.addEventListener("jambahr:consent-changed", handler);
    return () => window.removeEventListener("jambahr:consent-changed", handler);
  }, []);

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <PageviewTracker enabled={accepted} />
      {children}
    </PHProvider>
  );
}
```

Key behavior changes:
- `posthog.init` only runs if `localStorage["jambahr-cookie-consent"] === "accepted"`.
- A `"jambahr:consent-changed"` event listener triggers a re-attempt at init when the banner records an accept.
- `PageviewTracker` only fires `posthog.capture` when consent has been accepted.
- The `PHProvider` still wraps children (no-op until init is called) so any future code that imports the posthog client doesn't crash.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/posthog-provider.tsx
git commit -m "feat(consent): gate PostHog initialization behind cookie consent"
```

---

## Task 11: Mount the cookie banner in the root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Import and mount the banner**

Edit `src/app/layout.tsx`. Add this import near the top with the other component imports:

```ts
import { CookieBanner } from "@/components/layout/cookie-banner";
```

In the JSX, find the closing `</PostHogProvider>` (or wherever `{children}` is rendered) and add `<CookieBanner />` as a sibling to `<Toaster />`:

```tsx
<PostHogProvider>
  {children}
  <Toaster
    position="bottom-right"
    toastOptions={{
      className: "font-sans",
    }}
  />
  <CookieBanner />
</PostHogProvider>
```

- [ ] **Step 2: Manual verification**

```bash
npm run dev
```

Open `http://localhost:3000` in a browser with `localStorage` cleared:
1. **First visit:** the cookie banner appears at the bottom of the page.
2. Click **Reject**. Banner dismisses. Open DevTools → Application → Local Storage and confirm `jambahr-cookie-consent = "rejected"`. In DevTools → Network, confirm no requests to `posthog.com` / `posthog.app.io` are made.
3. Reload the page. Banner does **not** appear.
4. Manually clear `jambahr-cookie-consent` in localStorage and reload. Banner reappears.
5. Click **Accept**. Banner dismisses. localStorage shows `accepted`. Network tab now shows PostHog requests.

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(consent): mount CookieBanner in root layout"
```

---

## Task 12: Add Legal column and Cookie settings link to home page footer

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Convert the home page to use the cookie-banner client export**

The `openCookieSettings` function is exported from a client component (`cookie-banner.tsx`). Calling it from `page.tsx` (a server component) requires a small client wrapper. Create one inline by extracting the footer button to a tiny client component.

Add a new file `src/components/layout/cookie-settings-button.tsx`:

```tsx
"use client";

import { openCookieSettings } from "@/components/layout/cookie-banner";

export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCookieSettings}
      className={className ?? "block text-left hover:text-foreground transition-colors"}
    >
      Cookie settings
    </button>
  );
}
```

- [ ] **Step 2: Add the Legal column to the footer**

Edit `src/app/page.tsx`. Find the footer columns (the `<div className="flex flex-wrap gap-8 text-sm">` containing Product / Resources / Company). Add this import at the top:

```ts
import { CookieSettingsButton } from "@/components/layout/cookie-settings-button";
```

Then add a fourth column **after** the existing "Company" column inside that flex container:

```tsx
<div className="space-y-2">
  <p className="font-semibold text-foreground">Legal</p>
  <div className="space-y-1.5 text-muted-foreground">
    <Link href="/privacy" className="block hover:text-foreground transition-colors">Privacy Policy</Link>
    <Link href="/terms" className="block hover:text-foreground transition-colors">Terms of Service</Link>
    <CookieSettingsButton />
  </div>
</div>
```

- [ ] **Step 3: Manual verification**

```bash
npm run dev
```

Open `http://localhost:3000` and scroll to the footer. Expected:
1. Four columns: Product, Resources, Company, Legal.
2. Privacy Policy and Terms of Service links navigate to `/privacy` and `/terms`.
3. Clicking **Cookie settings** re-opens the cookie banner even after you've previously accepted/rejected.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/cookie-settings-button.tsx src/app/page.tsx
git commit -m "feat(legal): add Legal column to home footer with Privacy/Terms/Cookie settings"
```

---

## Task 13: End-to-end smoke test and final push

**Files:**
- No changes. Pure verification.

- [ ] **Step 1: Build the production bundle**

```bash
npm run build
```

Expected: build completes with no errors. Routes summary should list `/privacy` and `/terms` as static.

- [ ] **Step 2: Run the production build locally**

```bash
npm run start
```

Then in another terminal:

```bash
curl -sI http://localhost:3000/privacy | head -5
curl -sI http://localhost:3000/terms | head -5
curl -s http://localhost:3000/sitemap.xml | grep -E "privacy|terms"
curl -s http://localhost:3000/robots.txt
```

Expected:
- Both pages return `HTTP/1.1 200 OK`.
- Sitemap contains `/privacy` and `/terms` entries.
- Robots does not list `/privacy` or `/terms` under disallow.

Stop the production server.

- [ ] **Step 3: Anchor link check**

In the browser, open `http://localhost:3000/privacy#cookies`. Expected: page loads and scrolls to the "Cookies" heading. If it does not scroll (no heading with that ID), confirm the markdown contains a heading like `## Cookies` and that `remark-html` generated an `id` attribute. If the anchor still does not work, install `rehype-slug` and chain it in `src/lib/legal.ts` — but most likely the existing remark pipeline produced the IDs already.

- [ ] **Step 4: Push to main**

```bash
git push origin main
```

Wait for Vercel to deploy. Then verify live:

```bash
curl -sI https://jambahr.com/privacy
curl -sI https://jambahr.com/terms
```

Both should return `200`. Open them in a browser to confirm rendering. Sign up a fresh test org to confirm the consent checkbox + DB record path works in production.

- [ ] **Step 5: Update onboarding nudge / welcome email copy (optional, future)**

Out of scope for this task — note that any future welcome email could include "By using JambaHR you've agreed to our Privacy Policy and Terms of Service" with links, but that is not required for v1 since consent is recorded at onboarding.
