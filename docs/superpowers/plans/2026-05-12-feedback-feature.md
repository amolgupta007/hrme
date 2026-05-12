# Feedback Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an in-app "Send feedback" surface available to all roles (owner / admin / manager / employee) that captures bugs, feature requests, and freeform feedback into Supabase, emails the founder on every submission, and provides a `/superadmin/feedback` triage view.

**Architecture:** New `feedback_reports` table; a single React-context-mounted dialog reachable from the Clerk `UserButton` dropdown and the `Cmd/Ctrl+/` keyboard shortcut; server actions in `src/actions/feedback.ts` follow the existing `getCurrentUser()` + admin-Supabase-client pattern; superadmin triage gated by the existing `superadmin_session` cookie; Resend email via `FOUNDER_EMAIL_FROM`.

**Tech Stack:** Next.js 14 App Router · TypeScript · Supabase Postgres (admin client, RLS advisory) · Supabase Storage (`feedback-screenshots` bucket) · Clerk `UserButton` · Radix Dialog primitives · React Email · Resend · Zod for validation · `sonner` for toasts · `lucide-react` icons.

**Verification harness:** This codebase has no Jest/Vitest runner. All verification uses `npm run lint`, `npm run build`, manual browser walk-through against `npm run dev`, and direct Supabase MCP queries for backend assertions. Each task below specifies the exact verification command and expected output.

**Spec reference:** `docs/superpowers/specs/2026-05-12-feedback-feature-design.md`

---

## File Structure

### Commit 1 — Backend

| Path | Action | Purpose |
|---|---|---|
| `supabase/migrations/011_feedback_reports.sql` | create | Table + indexes + RLS policies + trigger |
| `src/components/emails/feedback-received.tsx` | create | React Email template for founder alert |
| `src/actions/feedback.ts` | create | Server actions: `submitFeedback`, `listMyFeedback`, `getMyFeedback`, `listAllFeedback`, `getFeedbackForSuperadmin`, `updateFeedbackTriage` |
| `src/types/index.ts` | modify | Add `FeedbackReport`, `FeedbackType`, `FeedbackStatus`, `FeedbackSeverity` types |

### Commit 2 — User-facing UI

| Path | Action | Purpose |
|---|---|---|
| `src/components/feedback/feedback-context.tsx` | create | React context for dialog open-state |
| `src/components/feedback/feedback-dialog.tsx` | create | Radix Dialog with the form |
| `src/components/feedback/report-feedback-trigger.tsx` | create | Mounts dialog, registers Cmd+/ listener |
| `src/components/layout/sidebar.tsx` | modify | Inline `<UserButton.Action>` for "Send feedback" + `<UserButton.Link>` for "My Feedback" |
| `src/app/dashboard/layout.tsx` | modify | Wrap children in `<FeedbackTriggerProvider>` |
| `src/app/dashboard/feedback/page.tsx` | create | Server page — fetch own reports |
| `src/components/feedback/my-feedback-client.tsx` | create | Client table + row detail modal |

### Commit 3 — Superadmin triage

| Path | Action | Purpose |
|---|---|---|
| `src/app/superadmin/feedback/page.tsx` | create | List with filters |
| `src/components/superadmin/feedback/feedback-list-client.tsx` | create | Filter UI + table |
| `src/app/superadmin/feedback/[id]/page.tsx` | create | Detail page |
| `src/components/superadmin/feedback/feedback-detail-client.tsx` | create | Triage form (status/priority/notes) |
| `src/app/superadmin/dashboard/page.tsx` | modify | Add "Feedback" card linking to `/superadmin/feedback` |
| `CLAUDE.md` | modify | Add "Feedback Module" section + Known Issues entries |

---

## Pre-flight (one-off, before any task)

- [ ] **Confirm working tree is clean on `main`**

Run:
```bash
git status
```
Expected: working tree clean (or only the design-spec changes from the prior session committed).

- [ ] **Create the Supabase storage bucket via MCP (one-off, will not be re-run by migrations)**

Run via Supabase MCP `execute_sql` on project `imjwqktxzahhnfmfbtfc`:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-screenshots', 'feedback-screenshots', true)
ON CONFLICT (id) DO NOTHING
RETURNING id, name, public;
```
Expected: one row returned with `id='feedback-screenshots'`, `public=true`. (Or zero rows if the bucket already exists.)

---

## Commit 1 — Backend (migration + server actions + email)

### Task 1.1: Migration file

**Files:**
- Create: `supabase/migrations/011_feedback_reports.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/011_feedback_reports.sql
-- Feedback / bug-report capture surface. Used by /dashboard/feedback (any role)
-- and /superadmin/feedback (founder-only via SUPERADMIN_SECRET cookie).

CREATE TABLE feedback_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL,
  reporter_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  reporter_role TEXT NOT NULL CHECK (reporter_role IN ('owner','admin','manager','employee')),
  type TEXT NOT NULL CHECK (type IN ('bug','feature_request','feedback','other')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  severity TEXT CHECK (severity IN ('low','medium','high','critical')),
  screenshot_url TEXT,
  page_url TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','triaged','in_progress','resolved','wontfix')),
  priority TEXT CHECK (priority IN ('low','medium','high','critical')),
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX feedback_reports_org_status_idx ON feedback_reports (org_id, status);
CREATE INDEX feedback_reports_reporter_idx  ON feedback_reports (org_id, reporter_user_id);
CREATE INDEX feedback_reports_created_idx   ON feedback_reports (created_at DESC);

CREATE TRIGGER feedback_reports_updated_at
  BEFORE UPDATE ON feedback_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (advisory; service-role bypasses; enforcement lives in server actions)
ALTER TABLE feedback_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedback_reporter_select_own ON feedback_reports
  FOR SELECT
  USING (
    org_id = (auth.jwt() -> 'org' ->> 'id')::uuid
    AND reporter_user_id = auth.jwt() ->> 'sub'
  );

CREATE POLICY feedback_insert_own_org ON feedback_reports
  FOR INSERT
  WITH CHECK (
    org_id = (auth.jwt() -> 'org' ->> 'id')::uuid
    AND reporter_user_id = auth.jwt() ->> 'sub'
  );
-- No UPDATE / DELETE policies: service-role only.
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use `apply_migration` on project `imjwqktxzahhnfmfbtfc`, name `011_feedback_reports`, with the body above.

Expected: success response, no error.

- [ ] **Step 3: Verify table exists**

Run via Supabase MCP `execute_sql`:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'feedback_reports'
ORDER BY ordinal_position;
```
Expected: 19 columns matching the schema above, with `status` and `reporter_role` `NOT NULL`.

### Task 1.2: TypeScript types

**Files:**
- Modify: `src/types/index.ts` (append to existing exports)

- [ ] **Step 1: Append the new types**

Add at the end of the existing exports in `src/types/index.ts`:

```typescript
export type FeedbackType = "bug" | "feature_request" | "feedback" | "other";
export type FeedbackStatus = "new" | "triaged" | "in_progress" | "resolved" | "wontfix";
export type FeedbackSeverity = "low" | "medium" | "high" | "critical";
export type FeedbackPriority = "low" | "medium" | "high" | "critical";

export interface FeedbackReport {
  id: string;
  org_id: string;
  reporter_user_id: string;
  reporter_employee_id: string | null;
  reporter_role: UserRole;
  type: FeedbackType;
  title: string;
  description: string;
  severity: FeedbackSeverity | null;
  screenshot_url: string | null;
  page_url: string | null;
  user_agent: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority | null;
  admin_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

// Superadmin view joins org slug and reporter employee info
export interface FeedbackReportWithContext extends FeedbackReport {
  org_slug: string | null;
  org_name: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
}
```

- [ ] **Step 2: Run lint to verify no type errors**

Run:
```bash
npm run lint
```
Expected: no new errors introduced by the additions.

### Task 1.3: Email template

**Files:**
- Create: `src/components/emails/feedback-received.tsx`

- [ ] **Step 1: Write the template (mirror `founder-alert.tsx` style)**

```tsx
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface FeedbackReceivedEmailProps {
  type: "bug" | "feature_request" | "feedback" | "other";
  severity?: "low" | "medium" | "high" | "critical" | null;
  title: string;
  descriptionPreview: string;
  reporterName: string;
  reporterEmail: string;
  reporterRole: string;
  orgName: string;
  orgSlug: string;
  pageUrl: string | null;
  reviewUrl: string;
  submittedAt: string;
}

const TYPE_LABEL: Record<FeedbackReceivedEmailProps["type"], string> = {
  bug: "🐛 Bug report",
  feature_request: "✨ Feature request",
  feedback: "💬 Feedback",
  other: "📝 Other",
};

export function FeedbackReceivedEmail(props: FeedbackReceivedEmailProps) {
  const {
    type,
    severity,
    title,
    descriptionPreview,
    reporterName,
    reporterEmail,
    reporterRole,
    orgName,
    orgSlug,
    pageUrl,
    reviewUrl,
    submittedAt,
  } = props;

  const formattedTime = new Date(submittedAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const isCritical = type === "bug" && severity === "critical";

  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={isCritical ? badgeCriticalStyle : badgeStyle}>
            {TYPE_LABEL[type]}
            {severity ? ` · ${severity.toUpperCase()}` : ""}
          </Text>
          <Text style={headingStyle}>{title}</Text>

          <Section style={detailsStyle}>
            <Text style={detailRowStyle}>
              <strong>From:</strong> {reporterName} ({reporterEmail}) — {reporterRole}
            </Text>
            <Text style={detailRowStyle}>
              <strong>Org:</strong> {orgName} ({orgSlug})
            </Text>
            {pageUrl ? (
              <Text style={detailRowStyle}>
                <strong>Page:</strong> {pageUrl}
              </Text>
            ) : null}
            <Text style={detailRowStyle}>
              <strong>Submitted:</strong> {formattedTime} IST
            </Text>
          </Section>

          <Section style={detailsStyle}>
            <Text style={descriptionLabelStyle}>Description</Text>
            <Text style={descriptionStyle}>{descriptionPreview}</Text>
          </Section>

          <Button style={buttonStyle} href={reviewUrl}>
            Open in superadmin
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Automated alert from JambaHR feedback module.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
  backgroundColor: "#f8f9fa",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const containerStyle = {
  margin: "0 auto",
  padding: "32px 24px",
  maxWidth: "600px",
  backgroundColor: "#ffffff",
  borderRadius: "8px",
};

const badgeStyle = {
  display: "inline-block" as const,
  padding: "4px 10px",
  borderRadius: "999px",
  backgroundColor: "#e6f4ef",
  color: "#0d5d4a",
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  margin: 0,
};

const badgeCriticalStyle = {
  ...badgeStyle,
  backgroundColor: "#fee2e2",
  color: "#991b1b",
};

const headingStyle = {
  fontSize: "20px",
  fontWeight: 600,
  color: "#1a1a1a",
  margin: "12px 0 16px",
};

const detailsStyle = {
  backgroundColor: "#f8f9fa",
  padding: "16px",
  borderRadius: "6px",
  margin: "16px 0",
};

const detailRowStyle = {
  fontSize: "14px",
  color: "#374151",
  margin: "4px 0",
};

const descriptionLabelStyle = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  margin: "0 0 6px",
};

const descriptionStyle = {
  fontSize: "14px",
  color: "#1a1a1a",
  margin: 0,
  whiteSpace: "pre-wrap" as const,
};

const buttonStyle = {
  display: "inline-block" as const,
  padding: "10px 18px",
  backgroundColor: "#0d9488",
  color: "#ffffff",
  borderRadius: "6px",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "14px",
  marginTop: "8px",
};

const hrStyle = { borderColor: "#e5e7eb", margin: "24px 0" };
const footerStyle = { fontSize: "12px", color: "#9ca3af", margin: 0 };

export default FeedbackReceivedEmail;
```

- [ ] **Step 2: Lint**

Run:
```bash
npm run lint
```
Expected: no new errors.

### Task 1.4: Server actions

**Files:**
- Create: `src/actions/feedback.ts`

- [ ] **Step 1: Scaffold the file with imports and shared helpers**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { render } from "@react-email/render";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { isSuperadminAuthenticated } from "@/lib/superadmin-auth";
import { resend, FOUNDER_EMAIL_FROM } from "@/lib/resend";
import { FeedbackReceivedEmail } from "@/components/emails/feedback-received";
import type {
  ActionResult,
  FeedbackReport,
  FeedbackReportWithContext,
  FeedbackStatus,
  FeedbackPriority,
} from "@/types";

const RATE_LIMIT_WINDOW_MIN = 15;
const RATE_LIMIT_MAX = 5;
const SCREENSHOT_BUCKET = "feedback-screenshots";

const submitSchema = z.object({
  type: z.enum(["bug", "feature_request", "feedback", "other"]),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  severity: z.enum(["low", "medium", "high", "critical"]).optional().nullable(),
  pageUrl: z.string().max(2048).optional().nullable(),
  userAgent: z.string().max(512).optional().nullable(),
  screenshotPath: z.string().max(512).optional().nullable(),
});

const triageSchema = z.object({
  status: z.enum(["new", "triaged", "in_progress", "resolved", "wontfix"]),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().nullable(),
  adminNotes: z.string().max(4000).optional().nullable(),
});
```

- [ ] **Step 2: Add `submitFeedback` action**

Append:
```typescript
export async function submitFeedback(
  input: z.infer<typeof submitSchema>,
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  // Severity is only valid for bug reports
  if (data.type !== "bug" && data.severity) {
    return { success: false, error: "Severity only applies to bug reports" };
  }

  const supabase = createAdminSupabase();

  // Rate limit: 5 submissions per 15 minutes per user
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString();
  const { count } = await supabase
    .from("feedback_reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_user_id", user.clerkUserId)
    .gte("created_at", windowStart);

  if ((count ?? 0) >= RATE_LIMIT_MAX) {
    return { success: false, error: "Too many reports — please wait a few minutes." };
  }

  // Resolve screenshot public URL if path provided
  let screenshotUrl: string | null = null;
  if (data.screenshotPath) {
    const { data: urlData } = supabase.storage.from(SCREENSHOT_BUCKET).getPublicUrl(data.screenshotPath);
    screenshotUrl = urlData.publicUrl;
  }

  const { data: row, error: insertErr } = await supabase
    .from("feedback_reports")
    .insert({
      org_id: user.orgId,
      reporter_user_id: user.clerkUserId,
      reporter_employee_id: user.employeeId ?? null,
      reporter_role: user.role,
      type: data.type,
      title: data.title,
      description: data.description,
      severity: data.type === "bug" ? data.severity ?? null : null,
      screenshot_url: screenshotUrl,
      page_url: data.pageUrl ?? null,
      user_agent: data.userAgent ?? null,
    })
    .select("id")
    .single();

  if (insertErr || !row) {
    return { success: false, error: insertErr?.message ?? "Insert failed" };
  }

  // Best-effort founder email — never blocks insert
  try {
    const [{ data: org }, { data: emp }] = await Promise.all([
      supabase.from("organizations").select("name,slug").eq("id", user.orgId).single(),
      user.employeeId
        ? supabase.from("employees").select("first_name,last_name,email").eq("id", user.employeeId).single()
        : Promise.resolve({ data: null } as const),
    ]);

    const reporterName = emp
      ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || "(unknown)"
      : "(no employee record)";
    const reporterEmail = emp?.email ?? "(unknown)";

    const html = await render(
      FeedbackReceivedEmail({
        type: data.type,
        severity: data.type === "bug" ? data.severity ?? null : null,
        title: data.title,
        descriptionPreview: data.description.slice(0, 500),
        reporterName,
        reporterEmail,
        reporterRole: user.role,
        orgName: org?.name ?? "(unknown org)",
        orgSlug: org?.slug ?? "(unknown)",
        pageUrl: data.pageUrl ?? null,
        reviewUrl: `https://jambahr.com/superadmin/feedback/${row.id}`,
        submittedAt: new Date().toISOString(),
      }),
    );

    const isUrgent = data.type === "bug" && data.severity === "critical";
    const subject = `${isUrgent ? "[URGENT] " : ""}[Feedback] ${typeEmoji(data.type)} ${data.title}`;

    await resend.emails.send({
      from: FOUNDER_EMAIL_FROM,
      to: "amol@jambahr.com",
      subject,
      html,
    });
  } catch (err) {
    console.error("[feedback] founder email failed:", err);
  }

  revalidatePath("/dashboard/feedback");
  return { success: true, data: { id: row.id } };
}

function typeEmoji(type: z.infer<typeof submitSchema>["type"]): string {
  switch (type) {
    case "bug": return "🐛";
    case "feature_request": return "✨";
    case "feedback": return "💬";
    case "other": return "📝";
  }
}
```

- [ ] **Step 3a: Add the screenshot upload action**

The browser anon client cannot write to the `feedback-screenshots` bucket (no Supabase auth context — users are signed into Clerk, not Supabase). Route uploads through a service-role server action.

Append:
```typescript
export async function uploadFeedbackScreenshot(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, error: "No file provided" };
  if (file.size > 5 * 1024 * 1024) return { success: false, error: "File must be ≤5MB" };
  if (!["image/png", "image/jpeg"].includes(file.type)) {
    return { success: false, error: "PNG or JPG only" };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${user.orgId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const supabase = createAdminSupabase();
  const { error } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: { path } };
}
```

- [ ] **Step 3b: Add reporter-facing read actions**

Append:
```typescript
export async function listMyFeedback(): Promise<ActionResult<FeedbackReport[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("feedback_reports")
    .select("*")
    .eq("org_id", user.orgId)
    .eq("reporter_user_id", user.clerkUserId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as FeedbackReport[] };
}

export async function getMyFeedback(id: string): Promise<ActionResult<FeedbackReport>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("feedback_reports")
    .select("*")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .eq("reporter_user_id", user.clerkUserId)
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Not found" };
  return { success: true, data: data as FeedbackReport };
}
```

- [ ] **Step 4: Add superadmin read + triage actions**

Append:
```typescript
interface ListFilters {
  status?: FeedbackStatus | "all";
  type?: "bug" | "feature_request" | "feedback" | "other" | "all";
  severity?: "low" | "medium" | "high" | "critical" | "all";
  orgId?: string | "all";
}

export async function listAllFeedback(
  filters: ListFilters = {},
): Promise<ActionResult<FeedbackReportWithContext[]>> {
  if (!isSuperadminAuthenticated()) {
    return { success: false, error: "Unauthorized" };
  }

  const supabase = createAdminSupabase();
  let query = supabase
    .from("feedback_reports")
    .select("*, organizations:org_id (name, slug), employees:reporter_employee_id (first_name, last_name, email)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.type && filters.type !== "all") query = query.eq("type", filters.type);
  if (filters.severity && filters.severity !== "all") query = query.eq("severity", filters.severity);
  if (filters.orgId && filters.orgId !== "all") query = query.eq("org_id", filters.orgId);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  const mapped: FeedbackReportWithContext[] = (data ?? []).map((row: any) => ({
    ...row,
    org_slug: row.organizations?.slug ?? null,
    org_name: row.organizations?.name ?? null,
    reporter_name: row.employees
      ? `${row.employees.first_name ?? ""} ${row.employees.last_name ?? ""}`.trim() || null
      : null,
    reporter_email: row.employees?.email ?? null,
  }));

  return { success: true, data: mapped };
}

export async function getFeedbackForSuperadmin(
  id: string,
): Promise<ActionResult<FeedbackReportWithContext>> {
  if (!isSuperadminAuthenticated()) {
    return { success: false, error: "Unauthorized" };
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("feedback_reports")
    .select("*, organizations:org_id (name, slug), employees:reporter_employee_id (first_name, last_name, email)")
    .eq("id", id)
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Not found" };

  const row: any = data;
  return {
    success: true,
    data: {
      ...row,
      org_slug: row.organizations?.slug ?? null,
      org_name: row.organizations?.name ?? null,
      reporter_name: row.employees
        ? `${row.employees.first_name ?? ""} ${row.employees.last_name ?? ""}`.trim() || null
        : null,
      reporter_email: row.employees?.email ?? null,
    },
  };
}

export async function updateFeedbackTriage(
  id: string,
  input: z.infer<typeof triageSchema>,
): Promise<ActionResult<void>> {
  if (!isSuperadminAuthenticated()) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = triageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const supabase = createAdminSupabase();
  const update: Record<string, unknown> = {
    status: parsed.data.status,
    priority: parsed.data.priority ?? null,
    admin_notes: parsed.data.adminNotes ?? null,
  };

  if (parsed.data.status === "resolved") {
    update.resolved_at = new Date().toISOString();
    update.resolved_by = "superadmin";
  } else {
    update.resolved_at = null;
    update.resolved_by = null;
  }

  const { error } = await supabase.from("feedback_reports").update(update).eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/superadmin/feedback");
  revalidatePath(`/superadmin/feedback/${id}`);
  return { success: true, data: undefined };
}
```

- [ ] **Step 5: Lint and build**

Run:
```bash
npm run lint
```
Expected: no new errors.

Run:
```bash
npm run build
```
Expected: build succeeds (warnings about `any` in the mapping are acceptable — `next.config.js` has `typescript.ignoreBuildErrors: true` per CLAUDE.md Known Issue #3).

### Task 1.5: Smoke-test the backend via Supabase MCP

- [ ] **Step 1: Insert a fake row directly**

Run via Supabase MCP `execute_sql`:
```sql
INSERT INTO feedback_reports (org_id, reporter_user_id, reporter_role, type, title, description)
SELECT id, 'smoke_test_user', 'admin', 'feedback', 'Backend smoke test', 'If you can read this, the table works.'
FROM organizations LIMIT 1
RETURNING id, status, created_at;
```
Expected: one row returned with `status='new'`.

- [ ] **Step 2: Verify defaults populated**

Run:
```sql
SELECT id, status, severity, priority, screenshot_url, resolved_at
FROM feedback_reports
WHERE reporter_user_id = 'smoke_test_user';
```
Expected: `status='new'`, all others `NULL`.

- [ ] **Step 3: Clean up smoke row**

Run:
```sql
DELETE FROM feedback_reports WHERE reporter_user_id = 'smoke_test_user' RETURNING id;
```
Expected: one row deleted.

### Task 1.6: Commit and push

- [ ] **Step 1: Stage and commit**

```bash
git add supabase/migrations/011_feedback_reports.sql src/components/emails/feedback-received.tsx src/actions/feedback.ts src/types/index.ts
git commit -m "feat(feedback): migration 011 + server actions + founder email template

- feedback_reports table with status/severity/priority lifecycle
- submitFeedback rate-limits 5/15min per user, sends best-effort founder email
- superadmin read+triage actions gated via isSuperadminAuthenticated()
- new feedback-received.tsx React Email template"
git push origin main
```

Expected: push succeeds; Vercel build triggers and passes.

---

## Commit 2 — User-facing UI (trigger + My Submissions)

### Task 2.1: Feedback dialog context

**Files:**
- Create: `src/components/feedback/feedback-context.tsx`

- [ ] **Step 1: Write the context**

```tsx
"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface FeedbackContextValue {
  open: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => setOpen(true), []);
  const closeDialog = useCallback(() => setOpen(false), []);

  return (
    <FeedbackContext.Provider value={{ open, openDialog, closeDialog }}>
      {children}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within FeedbackProvider");
  return ctx;
}
```

### Task 2.2: Feedback dialog UI

**Files:**
- Create: `src/components/feedback/feedback-dialog.tsx`

- [ ] **Step 1: Inspect an existing Radix Dialog usage to match patterns**

Run:
```bash
grep -l "Dialog.Root\|DialogContent" src/components/grievances/ src/components/documents/ | head -3
```
Expected: at least one match — read it before writing the new dialog to match the project's existing Radix wrapper conventions (custom wrapper vs `@radix-ui/react-dialog` direct).

- [ ] **Step 2: Write the dialog**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { useFeedback } from "./feedback-context";
import { submitFeedback, uploadFeedbackScreenshot } from "@/actions/feedback";
import type { FeedbackType, FeedbackSeverity } from "@/types";

const TYPE_OPTIONS: { value: FeedbackType; label: string; emoji: string }[] = [
  { value: "bug", label: "Bug", emoji: "🐛" },
  { value: "feature_request", label: "Feature", emoji: "✨" },
  { value: "feedback", label: "Feedback", emoji: "💬" },
  { value: "other", label: "Other", emoji: "📝" },
];

const SEVERITY_OPTIONS: { value: FeedbackSeverity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export function FeedbackDialog() {
  const { open, closeDialog } = useFeedback();
  const pathname = usePathname();
  const [type, setType] = useState<FeedbackType>("bug");
  const [severity, setSeverity] = useState<FeedbackSeverity>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setType("bug");
      setSeverity("medium");
      setTitle("");
      setDescription("");
      setScreenshot(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!title.trim()) return toast.error("Title is required");
    if (!description.trim()) return toast.error("Description is required");

    setSubmitting(true);

    let screenshotPath: string | null = null;
    if (screenshot) {
      if (screenshot.size > MAX_SCREENSHOT_BYTES) {
        toast.error("Screenshot must be 5MB or smaller");
        setSubmitting(false);
        return;
      }
      const formData = new FormData();
      formData.append("file", screenshot);
      const uploadResult = await uploadFeedbackScreenshot(formData);
      if (!uploadResult.success) {
        toast.error(`Screenshot upload failed: ${uploadResult.error}`);
        setSubmitting(false);
        return;
      }
      screenshotPath = uploadResult.data.path;
    }

    const result = await submitFeedback({
      type,
      title: title.trim(),
      description: description.trim(),
      severity: type === "bug" ? severity : null,
      pageUrl: pathname,
      userAgent: navigator.userAgent.slice(0, 512),
      screenshotPath,
    });

    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Thanks — we got it. Track it under My Feedback.");
    closeDialog();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (v ? null : closeDialog())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background shadow-lg flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between border-b px-6 pt-6 pb-4 shrink-0">
            <Dialog.Title className="text-lg font-semibold">Send feedback</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Type</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      type === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    {opt.emoji} {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {type === "bug" ? (
              <div>
                <label className="text-sm font-medium" htmlFor="feedback-severity">Severity</label>
                <select
                  id="feedback-severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as FeedbackSeverity)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {SEVERITY_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="text-sm font-medium" htmlFor="feedback-title">Title</label>
              <input
                id="feedback-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                required
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="One-line summary"
              />
              <p className="mt-1 text-xs text-muted-foreground">{title.length}/120</p>
            </div>

            <div>
              <label className="text-sm font-medium" htmlFor="feedback-description">Description</label>
              <textarea
                id="feedback-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                required
                rows={6}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="What happened? What did you expect?"
              />
              <p className="mt-1 text-xs text-muted-foreground">{description.length}/2000</p>
            </div>

            <div>
              <label className="text-sm font-medium">Screenshot (optional)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm"
              />
              {screenshot ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Selected: {screenshot.name} ({Math.round(screenshot.size / 1024)} KB)
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">PNG or JPG, ≤5MB</p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Auto-captured: page URL, browser, your role.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t shrink-0">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send feedback
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

### Task 2.3: Trigger component (provider + keyboard shortcut + DOM-event bridge)

**Files:**
- Create: `src/components/feedback/report-feedback-trigger.tsx`

Clerk's `<UserButton.MenuItems>` does a `React.Children` iteration looking for direct `<UserButton.Action>` / `<UserButton.Link>` element types, so a component that returns `<UserButton.Action>` won't be detected. The `<UserButton.Action>` must live directly inside `<UserButton.MenuItems>`. We bridge it to our React context via a custom DOM event: the Action's `onClick` dispatches `window.dispatchEvent(new Event("open-feedback"))`, and a listener inside the provider calls `openDialog()`.

- [ ] **Step 1: Write the trigger**

```tsx
"use client";

import { useEffect } from "react";
import { FeedbackProvider, useFeedback } from "./feedback-context";
import { FeedbackDialog } from "./feedback-dialog";

export const OPEN_FEEDBACK_EVENT = "open-feedback";

function ShortcutAndEventListener() {
  const { openDialog } = useFeedback();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        // Inside text inputs, only fire on Shift+Cmd/Ctrl+/ to avoid hijacking
        if (tag === "INPUT" || tag === "TEXTAREA") {
          if (!e.shiftKey) return;
        }
        e.preventDefault();
        openDialog();
      }
    }
    function onOpen() {
      openDialog();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    };
  }, [openDialog]);
  return null;
}

export function ReportFeedbackTriggerRoot({ children }: { children: React.ReactNode }) {
  return (
    <FeedbackProvider>
      {children}
      <ShortcutAndEventListener />
      <FeedbackDialog />
    </FeedbackProvider>
  );
}
```

### Task 2.4: (Removed — no wrapper needed)

The `<UserButton.Action>` will be inlined directly in `src/components/layout/sidebar.tsx` (task 2.6) and dispatch the `open-feedback` event in its `onClick` handler. Skip this task — no new file.

### Task 2.5: Wire trigger into dashboard layout

**Files:**
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Wrap children with the provider**

Add import at the top:
```tsx
import { ReportFeedbackTriggerRoot } from "@/components/feedback/report-feedback-trigger";
```

Replace the JSX return so the entire dashboard tree is inside the provider:

```tsx
return (
  <ReportFeedbackTriggerRoot>
    <div className="flex min-h-screen">
      <Sidebar badges={badges} role={role} plan={plan} features={features} />
      <div className="flex flex-1 flex-col">
        <Header jambaHireEnabled={jambaHireEnabled} badges={badges} role={role} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  </ReportFeedbackTriggerRoot>
);
```

### Task 2.6: Add UserButton.Action in sidebar

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add MessageCircle and Bug icons to the lucide-react import**

Merge `MessageCircle` and `Bug` into the existing `lucide-react` import line at the top of `src/components/layout/sidebar.tsx`. Also import the event name constant from the trigger module:

```tsx
// existing line, add MessageCircle and Bug:
import {
  LayoutDashboard,
  Users,
  // … all existing icons …
  Lock,
  MessageCircle,
  Bug,
  type LucideIcon,
} from "lucide-react";

// new import:
import { OPEN_FEEDBACK_EVENT } from "@/components/feedback/report-feedback-trigger";
```

- [ ] **Step 2: Insert into the existing `<UserButton.MenuItems>` block**

Replace the existing block (around lines 167–173) so it now reads:

```tsx
<UserButton.MenuItems>
  <UserButton.Link
    label="My Profile"
    labelIcon={<UserCircle className="h-4 w-4" />}
    href="/dashboard/profile"
  />
  <UserButton.Link
    label="My Feedback"
    labelIcon={<MessageCircle className="h-4 w-4" />}
    href="/dashboard/feedback"
  />
  <UserButton.Action
    label="Send feedback"
    labelIcon={<Bug className="h-4 w-4" />}
    onClick={() => window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT))}
  />
</UserButton.MenuItems>
```

Direct `<UserButton.Action>` element is required — Clerk's children-iteration only recognizes its own subcomponents as direct children.

### Task 2.7: My Submissions page

**Files:**
- Create: `src/app/dashboard/feedback/page.tsx`
- Create: `src/components/feedback/my-feedback-client.tsx`

- [ ] **Step 1: Server page**

```tsx
import { listMyFeedback } from "@/actions/feedback";
import { MyFeedbackClient } from "@/components/feedback/my-feedback-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Feedback · JambaHR" };

export default async function MyFeedbackPage() {
  const result = await listMyFeedback();
  const rows = result.success ? result.data : [];
  const error = result.success ? null : result.error;
  return <MyFeedbackClient rows={rows} error={error} />;
}
```

- [ ] **Step 2: Client component**

```tsx
"use client";

import { formatDistanceToNow } from "date-fns";
import { Bug, Sparkles, MessageCircle, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFeedback } from "./feedback-context";
import type { FeedbackReport, FeedbackStatus } from "@/types";

const TYPE_ICON: Record<FeedbackReport["type"], React.ReactNode> = {
  bug: <Bug className="h-4 w-4 text-red-500" />,
  feature_request: <Sparkles className="h-4 w-4 text-amber-500" />,
  feedback: <MessageCircle className="h-4 w-4 text-blue-500" />,
  other: <FileText className="h-4 w-4 text-muted-foreground" />,
};

const STATUS_VARIANT: Record<FeedbackStatus, "default" | "secondary" | "success" | "warning"> = {
  new: "secondary",
  triaged: "warning",
  in_progress: "warning",
  resolved: "success",
  wontfix: "default",
};

export function MyFeedbackClient({ rows, error }: { rows: FeedbackReport[]; error: string | null }) {
  const { openDialog } = useFeedback();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Feedback</h1>
          <p className="text-sm text-muted-foreground">Bug reports, feature requests, and notes you've sent us.</p>
        </div>
        <Button onClick={openDialog}>Send feedback</Button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No reports yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Help us improve — send your first one.</p>
          <Button className="mt-4" onClick={openDialog}>Send feedback</Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium w-8" />
                <th className="px-4 py-2 text-left font-medium">Title</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{TYPE_ICON[r.type]}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.title}</div>
                    {r.admin_notes ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">Admin note: </span>{r.admin_notes}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[r.status]}>{r.status.replace("_", " ")}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

### Task 2.8: Manual browser verification

- [ ] **Step 1: Start the dev server**

Run:
```bash
npm run dev
```
Expected: server starts on http://localhost:3000.

- [ ] **Step 2: Sign in and walk the happy path**

Manual checklist (mark each ✅ before continuing):
- Open `/dashboard` while signed in.
- Click the avatar at bottom-left of sidebar → confirm "Send feedback" appears with the Bug icon and "My Feedback" appears above it.
- Click "Send feedback" → dialog opens centred on screen.
- Press `Cmd+/` (or `Ctrl+/`) anywhere on `/dashboard/employees` → same dialog opens.
- Select type = Bug → severity selector renders. Switch to Feature → severity disappears.
- Submit a real test report with type=Feedback, title="UI smoke test", description="Plan task 2.8 verification". Expect toast "Thanks — we got it…".
- Navigate to `/dashboard/feedback` → the row appears with status badge "new" and the relative time.
- Check `amol@jambahr.com` inbox → the founder alert email arrives within ~30s.
- Verify in Supabase MCP: `SELECT id, type, title, status, page_url, user_agent FROM feedback_reports ORDER BY created_at DESC LIMIT 1;` → matches what you just submitted.

- [ ] **Step 3: Try the rate limit**

Submit 5 more quick feedback rows. The 6th should show toast: "Too many reports — please wait a few minutes."

- [ ] **Step 4: Try the screenshot path**

Open the dialog again, attach a PNG ≤5MB, submit. Verify `screenshot_url` in the DB row points to a `feedback-screenshots/...` URL, and the URL loads in browser.

### Task 2.9: Lint, build, commit

- [ ] **Step 1: Lint**

Run:
```bash
npm run lint
```
Expected: no new errors.

- [ ] **Step 2: Build**

Run:
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Clean up smoke-test rows from the DB**

Run via Supabase MCP:
```sql
DELETE FROM feedback_reports
WHERE title IN ('UI smoke test', 'Backend smoke test')
   OR description ILIKE '%plan task 2.8 verification%'
RETURNING id;
```

- [ ] **Step 4: Commit**

```bash
git add src/components/feedback/ src/app/dashboard/feedback/ src/app/dashboard/layout.tsx src/components/layout/sidebar.tsx
git commit -m "feat(feedback): in-app dialog (UserButton + Cmd+/) and My Feedback page

- FeedbackProvider context mounted on dashboard layout
- Radix dialog with type/severity/title/description/screenshot fields
- Cmd/Ctrl+/ keyboard shortcut opens the dialog globally
- 'Send feedback' action and 'My Feedback' link added to UserButton dropdown
- /dashboard/feedback lists reporter's own submissions with status badges"
git push origin main
```

Expected: push succeeds; Vercel deploys.

---

## Commit 3 — Superadmin triage

### Task 3.1: Superadmin list page

**Files:**
- Create: `src/app/superadmin/feedback/page.tsx`
- Create: `src/components/superadmin/feedback/feedback-list-client.tsx`

- [ ] **Step 1: Confirm pattern by reading `src/app/superadmin/social/page.tsx`**

Already inspected in pre-flight — it uses `force-dynamic`, fetches via a server action, and renders a client component. Mirror that.

- [ ] **Step 2: Server page**

```tsx
import { redirect } from "next/navigation";
import { listAllFeedback } from "@/actions/feedback";
import { isSuperadminAuthenticated } from "@/lib/superadmin-auth";
import { FeedbackListClient } from "@/components/superadmin/feedback/feedback-list-client";
import type { FeedbackStatus } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "JambaHR Admin — Feedback" };

type FilterValue = "all" | string;

export default async function SuperadminFeedbackPage({
  searchParams,
}: {
  searchParams: { status?: string; type?: string; severity?: string };
}) {
  if (!isSuperadminAuthenticated()) redirect("/superadmin/login");

  const status = (searchParams.status as FilterValue) ?? "all";
  const type = (searchParams.type as FilterValue) ?? "all";
  const severity = (searchParams.severity as FilterValue) ?? "all";

  const result = await listAllFeedback({
    status: status as FeedbackStatus | "all",
    type: type as "bug" | "feature_request" | "feedback" | "other" | "all",
    severity: severity as "low" | "medium" | "high" | "critical" | "all",
  });

  return (
    <FeedbackListClient
      rows={result.success ? result.data : []}
      error={result.success ? null : result.error}
      filters={{ status, type, severity }}
    />
  );
}
```

- [ ] **Step 3: List client component**

```tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bug, Sparkles, MessageCircle, FileText, ChevronRight } from "lucide-react";
import type { FeedbackReportWithContext } from "@/types";

const TYPE_ICON: Record<string, React.ReactNode> = {
  bug: <Bug className="h-4 w-4 text-red-500" />,
  feature_request: <Sparkles className="h-4 w-4 text-amber-500" />,
  feedback: <MessageCircle className="h-4 w-4 text-blue-500" />,
  other: <FileText className="h-4 w-4 text-muted-foreground" />,
};

const STATUS_OPTIONS = ["all", "new", "triaged", "in_progress", "resolved", "wontfix"];
const TYPE_OPTIONS = ["all", "bug", "feature_request", "feedback", "other"];
const SEVERITY_OPTIONS = ["all", "low", "medium", "high", "critical"];

export function FeedbackListClient({
  rows,
  error,
  filters,
}: {
  rows: FeedbackReportWithContext[];
  error: string | null;
  filters: { status: string; type: string; severity: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    router.push(`/superadmin/feedback?${params.toString()}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Feedback</h1>
            <p className="text-sm text-gray-500">{rows.length} report{rows.length === 1 ? "" : "s"}</p>
          </div>
          <Link href="/superadmin/dashboard" className="text-sm text-teal-700 hover:underline">
            ← Back to dashboard
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <FilterSelect label="Status" value={filters.status} options={STATUS_OPTIONS} onChange={(v) => updateFilter("status", v)} />
          <FilterSelect label="Type" value={filters.type} options={TYPE_OPTIONS} onChange={(v) => updateFilter("type", v)} />
          <FilterSelect label="Severity" value={filters.severity} options={SEVERITY_OPTIONS} onChange={(v) => updateFilter("severity", v)} />
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-white py-12 text-center text-sm text-gray-500">No reports match these filters.</div>
        ) : (
          <ul className="divide-y rounded-lg border bg-white">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/superadmin/feedback/${r.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
                  <span>{TYPE_ICON[r.type]}</span>
                  {r.severity ? (
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      r.severity === "critical" ? "bg-red-100 text-red-800" :
                      r.severity === "high" ? "bg-orange-100 text-orange-800" :
                      "bg-gray-100 text-gray-700"
                    }`}>{r.severity}</span>
                  ) : null}
                  <span className="text-xs text-gray-500 w-24 truncate">{r.org_slug ?? "—"}</span>
                  <span className="flex-1 truncate font-medium text-gray-900">{r.title}</span>
                  <span className="text-xs text-gray-500 w-20">{r.status.replace("_", " ")}</span>
                  <span className="text-xs text-gray-500 w-24">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <span>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border bg-white px-2 py-1 text-sm"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt === "all" ? "All" : opt.replace("_", " ")}</option>
        ))}
      </select>
    </label>
  );
}
```

### Task 3.2: Superadmin detail page

**Files:**
- Create: `src/app/superadmin/feedback/[id]/page.tsx`
- Create: `src/components/superadmin/feedback/feedback-detail-client.tsx`

- [ ] **Step 1: Server page**

```tsx
import { notFound, redirect } from "next/navigation";
import { getFeedbackForSuperadmin } from "@/actions/feedback";
import { isSuperadminAuthenticated } from "@/lib/superadmin-auth";
import { FeedbackDetailClient } from "@/components/superadmin/feedback/feedback-detail-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "JambaHR Admin — Feedback Detail" };

export default async function SuperadminFeedbackDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!isSuperadminAuthenticated()) redirect("/superadmin/login");

  const result = await getFeedbackForSuperadmin(params.id);
  if (!result.success || !result.data) notFound();

  return <FeedbackDetailClient row={result.data} />;
}
```

- [ ] **Step 2: Detail client**

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { updateFeedbackTriage } from "@/actions/feedback";
import type { FeedbackReportWithContext, FeedbackStatus, FeedbackPriority } from "@/types";

const STATUS_OPTIONS: FeedbackStatus[] = ["new", "triaged", "in_progress", "resolved", "wontfix"];
const PRIORITY_OPTIONS: (FeedbackPriority | "")[] = ["", "low", "medium", "high", "critical"];

export function FeedbackDetailClient({ row }: { row: FeedbackReportWithContext }) {
  const router = useRouter();
  const [status, setStatus] = useState<FeedbackStatus>(row.status);
  const [priority, setPriority] = useState<FeedbackPriority | "">(row.priority ?? "");
  const [adminNotes, setAdminNotes] = useState(row.admin_notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const result = await updateFeedbackTriage(row.id, {
      status,
      priority: priority || null,
      adminNotes: adminNotes || null,
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Saved");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/superadmin/feedback" className="mb-4 inline-flex items-center gap-2 text-sm text-teal-700 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to list
        </Link>

        <div className="rounded-lg border bg-white p-6 space-y-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500">{row.type.replace("_", " ")}{row.severity ? ` · ${row.severity}` : ""}</div>
            <h1 className="mt-1 text-xl font-semibold text-gray-900">{row.title}</h1>
            <div className="mt-2 text-xs text-gray-500">
              {row.reporter_name ?? "(no employee record)"} · {row.reporter_email ?? "—"} · {row.reporter_role} · {row.org_name ?? row.org_slug ?? "—"}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Submitted {new Date(row.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
              {row.page_url ? ` · from ${row.page_url}` : ""}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-gray-500">Description</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{row.description}</p>
          </div>

          {row.screenshot_url ? (
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-gray-500">Screenshot</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.screenshot_url} alt="reporter screenshot" className="mt-2 max-w-full rounded-md border" />
            </div>
          ) : null}

          {row.user_agent ? (
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-gray-500">User agent</div>
              <p className="mt-1 break-all text-xs text-gray-500">{row.user_agent}</p>
            </div>
          ) : null}

          <div className="border-t pt-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Triage</h2>
            <div className="grid grid-cols-2 gap-4">
              <label className="text-sm">
                <span className="block text-xs font-medium text-gray-600">Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)} className="mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-sm">
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs font-medium text-gray-600">Priority</span>
                <select value={priority} onChange={(e) => setPriority(e.target.value as FeedbackPriority | "")} className="mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-sm">
                  {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p === "" ? "—" : p}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="block text-xs font-medium text-gray-600">Admin notes (visible to reporter)</span>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={4}
                maxLength={4000}
                className="mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save triage
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Task 3.3: Surface in superadmin dashboard

**Files:**
- Modify: `src/app/superadmin/dashboard/page.tsx`

The dashboard uses `<section>` blocks with a heading + description + link card. Mirror the "Social Agent" pattern (currently at lines ~74–97 of the file). Add a "Feedback" section that fetches counts at request time using `listAllFeedback`.

- [ ] **Step 1: Import the action and fetch counts**

At the top of `src/app/superadmin/dashboard/page.tsx`, add the import alongside the existing `listPosts` import:

```tsx
import { listAllFeedback } from "@/actions/feedback";
```

Inside `SuperadminDashboard`, after the existing `pendingResult / scheduledResult` Promise.all block, append a second `Promise.all` to fetch feedback counts:

```tsx
const [feedbackNewResult, feedbackTriagedResult] = await Promise.all([
  listAllFeedback({ status: "new" }),
  listAllFeedback({ status: "triaged" }),
]);
const feedbackCounts = {
  new: feedbackNewResult.success ? feedbackNewResult.data.length : 0,
  triaged: feedbackTriagedResult.success ? feedbackTriagedResult.data.length : 0,
};
```

- [ ] **Step 2: Insert the Feedback section right after the Social Agent section**

In the JSX, immediately after the closing `</section>` of the "Social Agent" block, insert:

```tsx
{/* Feedback */}
<section>
  <h2 className="mb-1 text-base font-semibold text-gray-900">Feedback</h2>
  <p className="mb-4 text-sm text-gray-500">
    Bug reports, feature requests, and freeform feedback from any role across all orgs.
  </p>
  <Link
    href="/superadmin/feedback"
    className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm transition hover:border-gray-300 hover:shadow"
  >
    <div className="flex gap-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">New</p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">{feedbackCounts.new}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">Triaged</p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">{feedbackCounts.triaged}</p>
      </div>
    </div>
    <span className="text-sm text-teal-700">Open inbox →</span>
  </Link>
</section>
```

No icon import needed — pattern matches Social Agent which is icon-less.

### Task 3.4: Manual triage walk-through

- [ ] **Step 1: Restart dev server if needed and sign-in to `/superadmin`**

Use the `SUPERADMIN_SECRET` cookie flow — visit `/superadmin/login`, enter the secret.

- [ ] **Step 2: Submit a fresh test report from `/dashboard`**

Use the dialog. Type=Bug, severity=High, title="Triage walk-through", description="Plan task 3.4 verification."

- [ ] **Step 3: Visit `/superadmin/feedback`**

Expect: the new row appears at the top.

- [ ] **Step 4: Apply each filter**

- Set `status=new` → row still visible.
- Set `status=resolved` → row hidden.
- Reset to `all`.
- Set `type=bug` → visible. `type=feedback` → hidden. Reset.
- Set `severity=high` → visible. `severity=low` → hidden. Reset.

- [ ] **Step 5: Open the detail page**

- Click the row → detail page renders.
- Confirm reporter name, email, org, role, page URL all populated.
- Set status=triaged, priority=high, admin_notes="Looking at this." → Save.
- Toast "Saved" appears.
- Navigate back to list → row now shows status "triaged".

- [ ] **Step 6: Confirm reporter sees the admin note**

Sign back in as the reporter (their normal Clerk account). Visit `/dashboard/feedback` → the row should show the admin note as a subtle label under the title.

- [ ] **Step 7: Resolve flow**

Back in superadmin → set status=resolved → Save. Verify:
```sql
SELECT id, status, resolved_at, resolved_by FROM feedback_reports
WHERE title = 'Triage walk-through';
```
Expected: `resolved_at` populated, `resolved_by='superadmin'`.

### Task 3.5: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the new module section**

Insert a new section after the Grievances section (or wherever modules are listed), structured the same way:

```markdown
## Feedback Module (`/dashboard/feedback`)

Available to **all roles**. Users send bug reports, feature requests, or freeform feedback via a single dialog reachable from:
- the **avatar dropdown** (Clerk `<UserButton.Action>` mounted in `src/components/layout/sidebar.tsx`)
- the **`Cmd/Ctrl+/` keyboard shortcut** (listener in `src/components/feedback/report-feedback-trigger.tsx`)

The dialog auto-captures `page_url`, `user_agent`, and snapshots the reporter's role. Optional screenshot upload goes to public Supabase bucket `feedback-screenshots`.

On submit:
- Row inserted into `feedback_reports` (org-scoped)
- Best-effort founder alert email via `FOUNDER_EMAIL_FROM` (`amol@jambahr.com`), template `feedback-received.tsx`
- Rate-limited to 5 submissions per 15 minutes per user

Triage happens at **`/superadmin/feedback`** — founder-only, gated by `SUPERADMIN_SESSION_TOKEN`/`SUPERADMIN_SECRET` cookie via `isSuperadminAuthenticated()`. Org admins do NOT have a per-org feedback inbox in v1.

Lifecycle: `new → triaged → in_progress → resolved | wontfix`. Reporter sees `admin_notes` on their `/dashboard/feedback` row.

Anonymous submissions are explicitly **not** supported (use the grievances module for that flow).
```

- [ ] **Step 2: Append three Known Issues entries**

Add to the Known Issues section:

```markdown
45. **`feedback-screenshots` bucket**: Must be created via `INSERT INTO storage.buckets (id, name, public) VALUES ('feedback-screenshots', 'feedback-screenshots', true)` before deploying — not in migration 011 because storage DDL is environment-specific.
46. **Feedback dialog mounting**: `<ReportFeedbackTriggerRoot>` is mounted at the dashboard layout. It does NOT exist on public pages (`/`, `/sign-in`, `/blog`, `/careers`, `/offers`, `/apply/r`). Feedback can only be submitted from inside `/dashboard/*`.
47. **Feedback Cmd+/ inside form fields**: To avoid hijacking text-input shortcuts, the listener requires `Shift+Cmd/Ctrl+/` when focus is inside an `<input>` or `<textarea>`. Outside text fields, plain `Cmd/Ctrl+/` works.
```

- [ ] **Step 3: Update the Database Schema section**

Add a row to the "Tables added post-initial-migration" list:
```markdown
`feedback_reports`
```

### Task 3.6: Lint, build, commit, push

- [ ] **Step 1: Clean up smoke rows**

Run via Supabase MCP:
```sql
DELETE FROM feedback_reports WHERE title IN ('Triage walk-through') RETURNING id;
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```
Expected: no new errors.

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit and push**

```bash
git add src/app/superadmin/feedback/ src/components/superadmin/feedback/ src/app/superadmin/dashboard/page.tsx CLAUDE.md
git commit -m "feat(feedback): superadmin triage list + detail page

- /superadmin/feedback list with status/type/severity filters
- /superadmin/feedback/[id] detail page with status, priority, admin_notes
- Linked from /superadmin/dashboard card grid
- CLAUDE.md updated with module section and three new known-issues entries"
git push origin main
```

Expected: push succeeds; Vercel deploys; live triage view available.

---

## Final acceptance pass

After commit 3 deploys:

- [ ] Submit a real feedback report from the production site as each role (owner, admin, manager, employee — use the test1 org).
- [ ] Confirm all four arrive in `amol@jambahr.com`.
- [ ] Confirm each appears under `/superadmin/feedback` with correct reporter info.
- [ ] Confirm rate limit triggers on a 6th submission inside 15 minutes.
- [ ] Confirm `Cmd+/` works on `/dashboard`, `/dashboard/employees`, `/dashboard/payroll`, and `/dashboard/settings`.
- [ ] Confirm `Cmd+/` is a no-op on public pages (`/`, `/sign-in`).

If all pass, the feature is done. Move on or schedule v1.1 enhancements (status-change email to reporter, public roadmap).
