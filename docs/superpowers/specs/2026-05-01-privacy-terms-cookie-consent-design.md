# Privacy Policy, Terms of Service & Cookie Consent — Design

**Date:** 2026-05-01
**Status:** Approved by user

## Goal

Surface JambaHR's Privacy Policy and Terms of Service as first-class pages on the marketing site, capture explicit consent during owner onboarding (recorded in the database), and add a cookie consent banner that gates analytics for anonymous visitors.

## Why

The product handles employee PII for Indian SMBs. India's DPDP Act 2023 expects explicit, recorded consent for processing personal data. Enterprise customers reviewing the product during procurement will look for visible legal pages and a cookie banner. The current state has neither — only a `.docx` privacy policy sitting in `sample-documents/policy/`.

## Scope

| In | Out |
|---|---|
| `/privacy` and `/terms` public pages | Re-prompting existing users on policy updates |
| Cookie banner with PostHog gating | Dashboard footer with legal links |
| Required consent checkbox at onboarding step 2 | Retroactive consent for existing orgs |
| DB recording of consent (timestamp + version) | Separate Cookie Policy document (covered inside Privacy) |
| Mammoth-based one-shot `.docx` → markdown conversion | Real-time docx rendering at request time |

## Architecture

Three independent surfaces, each with one job:

| Surface | Audience | Where it appears | Job |
|---|---|---|---|
| Static legal pages | Anyone | `/privacy`, `/terms` | Render the docs |
| Cookie banner | Anonymous + signed-in visitors | All pages | Gate PostHog until accepted/rejected |
| Onboarding consent | New org owners | Onboarding step 2 | Required checkbox before org creation |

Source of truth: the `.docx` files under `sample-documents/policy/`. They get converted **at build time / on demand** via a one-shot script using `mammoth`. The output `.md` files are committed to `src/content/legal/` and rendered through the existing `gray-matter + remark + remark-html + remark-gfm` pipeline (same as the blog).

```
sample-documents/policy/*.docx
        │
        ▼  npm run convert-legal  (one shot, dev only)
src/content/legal/{privacy,terms}.md   ← committed to git
        │
        ▼  src/lib/legal.ts (mirrors src/lib/blog.ts)
        │
        ▼
src/app/privacy/page.tsx
src/app/terms/page.tsx                 ← public routes
```

`mammoth` lives in `devDependencies` only — no runtime cost.

## Component 1: Cookie Banner + PostHog Gating

### Behavior
- Three states stored in `localStorage` under key `jambahr-cookie-consent`: `"accepted"` | `"rejected"` | `null` (undecided).
- On first visit, if state is `null`, a bottom-anchored banner appears (persistent, not a transient toast).
- Banner copy: *"We use cookies for analytics. By clicking Accept, you agree to our [Privacy Policy](/privacy) and [Cookie Policy](/privacy#cookies)."* Buttons: **Accept**, **Reject**.
- Accept → flag = `accepted`, PostHog initializes, banner dismisses.
- Reject → flag = `rejected`, PostHog does not initialize, banner dismisses.
- Footer "Cookie settings" link re-opens the banner so users can change their mind.

### PostHog gating
`src/components/layout/posthog-provider.tsx` currently calls `posthog.init()` unconditionally on mount. Change to:
1. Read `localStorage["jambahr-cookie-consent"]` on mount.
2. Only call `posthog.init()` if state is `"accepted"`.
3. Listen for a custom event `jambahr:consent-changed` so that clicking Accept later in the session initializes PostHog at that moment.

**Rationale for hard-gate (not anonymous mode):** PostHog's anonymous mode still drops a cookie, contradicting an explicit "Reject." Hard-gate is honest and matches user intent.

### Files
**New:** `src/components/layout/cookie-banner.tsx` (component + `useCookieConsent()` hook + dispatches `jambahr:consent-changed` on state change)

**Changed:**
- `src/components/layout/posthog-provider.tsx` — read consent before init
- `src/app/layout.tsx` — mount `<CookieBanner />`

## Component 2: Onboarding Consent + DB

### Schema change
`organizations` table gets three new columns:

```sql
alter table organizations
  add column if not exists privacy_policy_accepted_at timestamptz,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists policy_version_accepted text;
```

`policy_version_accepted` is a single string like `"2026-05-01"` matching the `effective` date frontmatter on the markdown docs. One field covers both docs since they version together.

**Data type rationale** (per Supabase Postgres best practices):
- `timestamptz` (not `timestamp`) so consent timestamps are timezone-aware — matters for legal audit across regions.
- `text` (not `varchar(n)`) for the version string — same performance, no artificial length limit.
- Lowercase snake_case identifiers — consistent with the rest of the schema, no quoting required.

**No index needed.** These columns are written once at org creation and read at most once per dashboard request (only if we add re-prompting later, which is v2). Postgres can sequential-scan the `organizations` table cheaply since it has very few rows. Adding an index now would be premature optimization.

**`if not exists`** keeps the `ALTER TABLE` idempotent — safe to re-run if a partial migration occurs. Postgres ≥ 9.6 supports this clause.

Run via Supabase Dashboard SQL Editor (per the project's migration convention — new tables/columns are not in `001_initial_schema.sql`).

### UI change
`src/app/onboarding/page.tsx`, step 2, above the "Launch JambaHR" button:

```
☐ I agree to the Privacy Policy and Terms of Service.
   (links open in new tab to /privacy and /terms)
```

The "Launch JambaHR" button stays `disabled` until the checkbox is checked.

### Server action change
`syncOrgToSupabase` in `src/actions/organizations.ts` accepts new args:

```ts
syncOrgToSupabase({
  clerkOrgId,
  name,
  privacyAcceptedAt: Date,
  termsAcceptedAt: Date,
  policyVersionAccepted: string,
});
```

These map to the three new DB columns.

### Single source of truth for version
`src/config/legal.ts` (new) exports:

```ts
export const LATEST_POLICY_VERSION = "2026-05-01";
```

Read by both:
1. The conversion script (writes it into the markdown frontmatter)
2. The onboarding page (sends it as `policyVersionAccepted`)

Bumping this constant in the future is the trigger for re-prompting (out of scope for v1).

## Component 3: Page Rendering

### Build-time conversion script
`scripts/convert-legal-docs.js` (Node, run manually):

```js
const mammoth = require("mammoth");
const fs = require("fs");
const path = require("path");

const sources = [
  { docx: "JambaHR_Privacy_Policy.docx", slug: "privacy", title: "Privacy Policy" },
  { docx: "TERMS OF SERVICE.docx",       slug: "terms",   title: "Terms of Service" },
];

const VERSION = "2026-05-01";  // mirror src/config/legal.ts

for (const s of sources) {
  const input = path.join("sample-documents/policy", s.docx);
  const { value: markdown } = await mammoth.convertToMarkdown({ path: input });
  const frontmatter = `---\ntitle: ${s.title}\nslug: ${s.slug}\neffective: ${VERSION}\nversion: ${VERSION}\n---\n\n`;
  fs.writeFileSync(`src/content/legal/${s.slug}.md`, frontmatter + markdown);
}
```

Wired up in `package.json`:
```json
"convert-legal": "node scripts/convert-legal-docs.js"
```

Run once now; re-run only when source `.docx` is updated.

### Rendering library
`src/lib/legal.ts` mirrors `src/lib/blog.ts`:

```ts
export type LegalDoc = {
  slug: "privacy" | "terms";
  title: string;
  effective: string;
  version: string;
  content: string;  // rendered HTML
};

export async function getLegalDoc(slug: "privacy" | "terms"): Promise<LegalDoc | null>;
```

Same pipeline as blog: `gray-matter` for frontmatter, `remark` + `remark-gfm` + `remark-html` for body.

### Pages
Two thin server components:
- `src/app/privacy/page.tsx`
- `src/app/terms/page.tsx`

Each renders title + "Effective May 1, 2026" + body in the same `prose` typography wrapper used by blog post pages. No new layout file.

### Anchor links
`remark` auto-generates heading IDs (e.g., `<h2>Cookies</h2>` → `id="cookies"`), so `/privacy#cookies` works without extra plumbing. The cookie banner deep-links to it.

### Middleware
`src/middleware.ts` — add `/privacy` and `/terms` to `isPublicRoute`:

```ts
const isPublicRoute = createRouteMatcher([
  // ... existing entries
  "/privacy",
  "/terms",
]);
```

## Component 4: Footer + Sitemap

### Home page footer
`src/app/page.tsx` footer — add a fourth column "Legal":

```
Product   |  Resources   |  Company   |  Legal
Features     Blog           Contact      Privacy Policy
Pricing      PF/PT/TDS      LinkedIn     Terms of Service
Get Started  Leave Policy                Cookie settings
```

"Cookie settings" is a `<button>` (not `<a>`) that calls a function exposed by the `useCookieConsent()` hook to re-open the banner.

### Sitemap
`src/app/sitemap.ts` — add two static entries:

```ts
{ url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.5 },
{ url: `${BASE_URL}/terms`,   lastModified: new Date(), changeFrequency: "yearly", priority: 0.5 },
```

### Robots
Already permissive — `/privacy` and `/terms` are not in the disallow list. No change.

## Files Summary

### New (8)
- `scripts/convert-legal-docs.js`
- `src/content/legal/privacy.md` (generated, committed)
- `src/content/legal/terms.md` (generated, committed)
- `src/lib/legal.ts`
- `src/config/legal.ts`
- `src/app/privacy/page.tsx`
- `src/app/terms/page.tsx`
- `src/components/layout/cookie-banner.tsx`

### Changed (8)
- `package.json` — add `mammoth` to `devDependencies` + `convert-legal` script
- `src/middleware.ts` — public routes
- `src/components/layout/posthog-provider.tsx` — consent gating
- `src/app/layout.tsx` — mount `<CookieBanner />`
- `src/app/page.tsx` — footer Legal column
- `src/app/onboarding/page.tsx` — consent checkbox + disabled state
- `src/actions/organizations.ts` — persist consent fields
- `src/app/sitemap.ts` — two new entries

### Database
One `ALTER TABLE organizations` adding three columns, run via Supabase SQL Editor.

## Out of Scope (v1)

1. **Re-prompting on policy updates** — `LATEST_POLICY_VERSION` is recorded but no logic gates dashboard access if version is outdated. Add later by middleware check that re-routes to a `/policy-update` page if `policy_version_accepted < LATEST_POLICY_VERSION`.
2. **Retroactive consent for existing orgs** — orgs created before this ships have `privacy_policy_accepted_at = NULL`. Could be backfilled via a one-time migration declaring all existing orgs accepted-at-deployment-time, but unnecessary for v1.
3. **Dashboard footer with legal links** — employees use the dashboard daily; legal links live in the marketing footer + Settings page (future).
4. **Separate Cookie Policy document** — cookies are covered inside Privacy Policy at `/privacy#cookies` (standard SaaS pattern: Notion, Linear, Slack).

## Risks / Gotchas

1. **`docx` formatting fidelity** — mammoth produces decent markdown but tables, columns, and Word-specific styles can be lossy. After the first conversion, manually review `privacy.md` and `terms.md` and tweak as needed.
2. **PostHog already initialized** — if any existing user has the site loaded when this ships, PostHog is already running. Acceptable; consent applies forward.
3. **localStorage availability** — banner gracefully degrades if `localStorage` is blocked (corporate browsers): treat as undecided, show banner every visit. PostHog stays gated.
4. **Clerk sign-up screen** — happens before our onboarding consent. We're choosing onboarding (not sign-up) as the consent point because it lets us record the consent against the org row (which doesn't exist until onboarding). If a user signs up and never reaches onboarding, no org is created and no consent is needed.
