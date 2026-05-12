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
