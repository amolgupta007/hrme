"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { istTodayDate } from "@/lib/attendance/manual-punch-validation";
import {
  computeAckStatus,
  findLateJoiners,
  isContentChanged,
  isOverdue,
  isVisibleTo,
  resolveAudienceIds,
  splitRemindable,
  type AckState,
  type AckTotals,
  type AudienceTarget,
  type AudienceType,
} from "@/lib/announcements/ack-status";
import { emailAckReminders, notifyAckRequested } from "@/lib/announcements/notify";
import { loadPendingAcksFor, type PendingAck } from "@/lib/announcements/pending";
import type { ActionResult } from "@/types";

// ---- Types ----

export type AnnouncementCategory = "general" | "policy" | "event" | "urgent";

export type AnnouncementTargetView = AudienceTarget & { label: string };

export type Announcement = {
  id: string;
  org_id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  is_pinned: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_by_avatar_url: string | null;
  created_at: string;
  updated_at: string;
  /** True when the title/body has been edited since publishing. */
  edited: boolean;
  audience_type: AudienceType;
  targets: AnnouncementTargetView[];
  ack_required: boolean;
  ack_due_date: string | null;
  ack_version: number;
  content_version: number;
  /** The viewer's own acknowledgement state; null when they aren't asked to acknowledge. */
  my_ack: { state: Exclude<AckState, "left">; acknowledged_at: string | null } | null;
  /** Admin-only progress summary for ack-required announcements. */
  ack_totals: AckTotals | null;
  /**
   * Admin-only: any acknowledgement row exists, for ANY version. Deleting such
   * an announcement archives it. Differs from ack_totals.acknowledged, which
   * resets to 0 after a re-ack edit while the older records are still kept.
   */
  has_ack_records: boolean;
};

export type AnnouncementAudienceOptions = {
  departments: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string; department_id: string | null }>;
};

// ---- Schema ----

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

const announcementSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200, "Title too long"),
    body: z.string().trim().min(1, "Body is required").max(20000, "Body is too long"),
    is_pinned: z.boolean().default(false),
    category: z.enum(["general", "policy", "event", "urgent"]).default("general"),
    audience_type: z.enum(["all", "targeted"]).default("all"),
    targets: z
      .array(
        z.object({
          target_type: z.enum(["department", "employee"]),
          target_id: z.string().uuid(),
        })
      )
      .max(1000)
      .default([]),
    ack_required: z.boolean().default(false),
    ack_due_date: dateString.nullable().default(null),
  })
  .refine((d) => d.audience_type === "all" || d.targets.length > 0, {
    message: "Pick at least one department or employee, or choose Everyone",
    path: ["targets"],
  });

export type AnnouncementInput = z.input<typeof announcementSchema>;

function firstError(e: z.ZodError): string {
  return e.errors[0]?.message ?? "Validation failed";
}

function revalidateAnnouncementSurfaces() {
  revalidatePath("/dashboard/announcements");
  revalidatePath("/dashboard");
}

// ---- Internal helpers ----

type OrgEmployee = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  department_id: string | null;
  status: string;
  avatar_url: string | null;
};

async function loadOrgEmployees(supabase: any, orgId: string): Promise<OrgEmployee[]> {
  const { data } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, department_id, status, avatar_url")
    .eq("org_id", orgId);
  return (data ?? []) as OrgEmployee[];
}

function fullName(e: { first_name: string | null; last_name: string | null } | null | undefined) {
  if (!e) return null;
  return [e.first_name, e.last_name].filter(Boolean).join(" ") || null;
}

/** Targets must reference this org's departments/employees — never another tenant's. */
async function validateTargets(
  supabase: any,
  orgId: string,
  targets: AudienceTarget[]
): Promise<string | null> {
  const deptIds = targets.filter((t) => t.target_type === "department").map((t) => t.target_id);
  const empIds = targets.filter((t) => t.target_type === "employee").map((t) => t.target_id);
  if (deptIds.length) {
    const { data } = await supabase.from("departments").select("id").eq("org_id", orgId).in("id", deptIds);
    if ((data ?? []).length !== new Set(deptIds).size) return "Unknown department in audience";
  }
  if (empIds.length) {
    const { data } = await supabase.from("employees").select("id").eq("org_id", orgId).in("id", empIds);
    if ((data ?? []).length !== new Set(empIds).size) return "Unknown employee in audience";
  }
  return null;
}

async function replaceTargets(
  supabase: any,
  orgId: string,
  announcementId: string,
  audienceType: AudienceType,
  targets: AudienceTarget[]
) {
  await supabase.from("announcement_targets").delete().eq("announcement_id", announcementId).eq("org_id", orgId);
  if (audienceType === "targeted" && targets.length) {
    const unique = new Map(targets.map((t) => [`${t.target_type}:${t.target_id}`, t]));
    await supabase.from("announcement_targets").insert(
      [...unique.values()].map((t) => ({ org_id: orgId, announcement_id: announcementId, ...t }))
    );
  }
}

/**
 * Freeze the audience into announcement_recipients. Idempotent (ignores people
 * already snapshotted). Returns the ids newly added.
 */
async function snapshotRecipients(
  supabase: any,
  orgId: string,
  announcementId: string,
  audienceType: AudienceType,
  targets: AudienceTarget[],
  reason: "publish" | "late_add"
): Promise<string[]> {
  const employees = await loadOrgEmployees(supabase, orgId);
  const audience = resolveAudienceIds({ audienceType, targets, employees });
  const { data: existing } = await supabase
    .from("announcement_recipients")
    .select("employee_id")
    .eq("announcement_id", announcementId)
    .eq("org_id", orgId);
  const toAdd = findLateJoiners(
    audience,
    ((existing ?? []) as Array<{ employee_id: string }>).map((r) => r.employee_id)
  );
  if (toAdd.length) {
    await supabase.from("announcement_recipients").upsert(
      toAdd.map((employee_id) => ({
        org_id: orgId,
        announcement_id: announcementId,
        employee_id,
        added_reason: reason,
      })),
      { onConflict: "announcement_id,employee_id", ignoreDuplicates: true }
    );
  }
  return toAdd;
}

function fireAckRequested(
  supabase: any,
  orgId: string,
  announcementId: string,
  title: string,
  employeeIds: string[]
) {
  if (!employeeIds.length) return;
  waitUntil(
    notifyAckRequested(supabase, { orgId, employeeIds, announcementId, title, reminder: false }).catch(() => {})
  );
}

async function loadTargets(supabase: any, orgId: string, announcementIds: string[]) {
  if (!announcementIds.length) return [] as Array<AudienceTarget & { announcement_id: string }>;
  const { data } = await supabase
    .from("announcement_targets")
    .select("announcement_id, target_type, target_id")
    .eq("org_id", orgId)
    .in("announcement_id", announcementIds);
  return (data ?? []) as Array<AudienceTarget & { announcement_id: string }>;
}

// ---- Read actions ----

export async function getAnnouncementAudienceOptions(): Promise<ActionResult<AnnouncementAudienceOptions>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const [{ data: depts }, employees] = await Promise.all([
    supabase.from("departments").select("id, name").eq("org_id", user.orgId).order("name"),
    loadOrgEmployees(supabase, user.orgId),
  ]);
  return {
    success: true,
    data: {
      departments: (depts ?? []) as Array<{ id: string; name: string }>,
      employees: employees
        .filter((e) => e.status !== "terminated" && e.status !== "inactive")
        .map((e) => ({ id: e.id, name: fullName(e) ?? e.email ?? "Unnamed", department_id: e.department_id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
  };
}

export async function listAnnouncements(): Promise<ActionResult<Announcement[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const admin = isAdmin(user.role);

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .select("*, employees!created_by(first_name, last_name, avatar_url)")
    .eq("org_id", user.orgId)
    .is("archived_at", null)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as any[];
  const ids = rows.map((a) => a.id);
  const ackIds = rows.filter((a) => a.ack_required).map((a) => a.id);

  const [targets, employees, deptResult, recipientsResult, acksResult] = await Promise.all([
    loadTargets(supabase, user.orgId, ids),
    loadOrgEmployees(supabase, user.orgId),
    supabase.from("departments").select("id, name").eq("org_id", user.orgId),
    ackIds.length
      ? supabase
          .from("announcement_recipients")
          .select("announcement_id, employee_id")
          .eq("org_id", user.orgId)
          .in("announcement_id", ackIds)
      : Promise.resolve({ data: [] }),
    // All ids, not just ack-required ones: an announcement whose ack was later
    // switched off still has records that make delete an archive.
    ids.length
      ? supabase
          .from("announcement_acknowledgements")
          .select("announcement_id, employee_id, version, acknowledged_at")
          .eq("org_id", user.orgId)
          .in("announcement_id", ids)
      : Promise.resolve({ data: [] }),
  ]);

  const deptName = new Map(((deptResult as any).data ?? []).map((d: any) => [d.id, d.name as string]));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const me = user.employeeId ? empById.get(user.employeeId) : undefined;
  const recipients = ((recipientsResult as any).data ?? []) as Array<{ announcement_id: string; employee_id: string }>;
  const acks = ((acksResult as any).data ?? []) as Array<{
    announcement_id: string;
    employee_id: string;
    version: number;
    acknowledged_at: string;
  }>;
  const todayIst = istTodayDate();

  const out: Announcement[] = [];
  for (const a of rows) {
    const myTargets = targets.filter((t) => t.announcement_id === a.id);
    const myRecipients = recipients.filter((r) => r.announcement_id === a.id);
    const isRecipient = !!user.employeeId && myRecipients.some((r) => r.employee_id === user.employeeId);

    if (
      !isVisibleTo({
        isAdmin: admin,
        audienceType: a.audience_type,
        targets: myTargets,
        viewer: { id: user.employeeId ?? null, department_id: me?.department_id ?? null },
        isRecipient,
      })
    ) {
      continue;
    }

    let myAck: Announcement["my_ack"] = null;
    let totals: AckTotals | null = null;
    if (a.ack_required) {
      const annAcks = acks.filter((k) => k.announcement_id === a.id);
      if (isRecipient) {
        const mine = computeAckStatus({
          recipients: [{ employee_id: user.employeeId! }],
          acks: annAcks,
          employees,
          ackVersion: a.ack_version,
          dueDate: a.ack_due_date,
          todayIst,
        }).rows[0];
        if (mine.state !== "left") myAck = { state: mine.state, acknowledged_at: mine.acknowledgedAt };
      }
      if (admin) {
        totals = computeAckStatus({
          recipients: myRecipients,
          acks: annAcks,
          employees,
          ackVersion: a.ack_version,
          dueDate: a.ack_due_date,
          todayIst,
        }).totals;
      }
    }

    out.push({
      id: a.id,
      org_id: a.org_id,
      title: a.title,
      body: a.body,
      category: a.category ?? "general",
      is_pinned: a.is_pinned,
      created_by: a.created_by,
      created_by_name: fullName(a.employees),
      created_by_avatar_url: a.employees?.avatar_url ?? null,
      created_at: a.created_at,
      updated_at: a.updated_at,
      edited: (a.content_version ?? 1) > 1,
      audience_type: a.audience_type ?? "all",
      targets: myTargets.map((t) => ({
        target_type: t.target_type,
        target_id: t.target_id,
        label:
          t.target_type === "department"
            ? ((deptName.get(t.target_id) as string | undefined) ?? "Department")
            : (fullName(empById.get(t.target_id)) ?? "Employee"),
      })),
      ack_required: !!a.ack_required,
      ack_due_date: a.ack_due_date,
      ack_version: a.ack_version ?? 1,
      content_version: a.content_version ?? 1,
      my_ack: myAck,
      ack_totals: totals,
      has_ack_records: admin && acks.some((k) => k.announcement_id === a.id),
    });
  }
  return { success: true, data: out };
}

/**
 * The caller's outstanding acknowledgements — drives the dashboard
 * "Action required" card.
 */
export async function getMyPendingAcknowledgements(): Promise<PendingAck[]> {
  const user = await getCurrentUser();
  if (!user?.employeeId) return [];
  return loadPendingAcksFor(user.orgId, user.employeeId);
}

// ---- Write actions ----

export async function createAnnouncement(input: AnnouncementInput): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can post announcements" };

  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstError(parsed.error) };
  const v = parsed.data;
  if (v.ack_required && v.ack_due_date && v.ack_due_date < istTodayDate()) {
    return { success: false, error: "Due date can't be in the past" };
  }

  const supabase = createAdminSupabase();
  const targets = v.audience_type === "targeted" ? v.targets : [];
  const targetError = await validateTargets(supabase, user.orgId, targets);
  if (targetError) return { success: false, error: targetError };

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      org_id: user.orgId,
      title: v.title,
      body: v.body,
      is_pinned: v.is_pinned,
      category: v.category,
      audience_type: v.audience_type,
      ack_required: v.ack_required,
      ack_due_date: v.ack_required ? v.ack_due_date : null,
      created_by: user.employeeId,
    } as any)
    .select("id")
    .single();
  if (error || !data) return { success: false, error: error?.message ?? "Could not post announcement" };
  const id = (data as { id: string }).id;

  await supabase.from("announcement_versions").insert({
    announcement_id: id,
    org_id: user.orgId,
    version: 1,
    title: v.title,
    body: v.body,
    created_by: user.employeeId,
  } as any);
  await replaceTargets(supabase, user.orgId, id, v.audience_type, targets);

  if (v.ack_required) {
    const added = await snapshotRecipients(supabase, user.orgId, id, v.audience_type, targets, "publish");
    fireAckRequested(supabase, user.orgId, id, v.title, added);
  }

  revalidateAnnouncementSurfaces();
  return { success: true, data: { id } };
}

export async function updateAnnouncement(
  id: string,
  input: AnnouncementInput,
  opts: { requireReack?: boolean } = {}
): Promise<ActionResult<{ reackTriggered: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can edit announcements" };

  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstError(parsed.error) };
  const v = parsed.data;

  const supabase = createAdminSupabase();
  const { data: current } = await supabase
    .from("announcements")
    .select("id, title, body, ack_required, ack_due_date, ack_version, content_version, audience_type")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .is("archived_at", null)
    .maybeSingle();
  if (!current) return { success: false, error: "Announcement not found" };
  const cur = current as any;

  if (v.ack_required && v.ack_due_date && v.ack_due_date !== cur.ack_due_date && v.ack_due_date < istTodayDate()) {
    return { success: false, error: "Due date can't be in the past" };
  }

  // While acknowledgement is required the audience is frozen — the snapshot is
  // the source of truth, and late joiners go through "Add them".
  const audienceLocked = !!cur.ack_required;
  const audienceType: AudienceType = audienceLocked ? cur.audience_type : v.audience_type;
  const targets = audienceType === "targeted" ? v.targets : [];
  if (!audienceLocked) {
    const targetError = await validateTargets(supabase, user.orgId, targets);
    if (targetError) return { success: false, error: targetError };
  }

  const changed = isContentChanged(cur, v);
  const contentVersion = changed ? cur.content_version + 1 : cur.content_version;
  // Default to re-ack on a content change, unless the admin chose "minor fix".
  const reack = changed && v.ack_required && cur.ack_required && opts.requireReack !== false;
  const ackVersion = reack ? contentVersion : cur.ack_version;

  const { error } = await supabase
    .from("announcements")
    .update({
      title: v.title,
      body: v.body,
      is_pinned: v.is_pinned,
      category: v.category,
      audience_type: audienceType,
      ack_required: v.ack_required,
      ack_due_date: v.ack_required ? v.ack_due_date : null,
      content_version: contentVersion,
      ack_version: ackVersion,
    } as any)
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  if (changed) {
    await supabase.from("announcement_versions").insert({
      announcement_id: id,
      org_id: user.orgId,
      version: contentVersion,
      title: v.title,
      body: v.body,
      requires_reack: reack,
      created_by: user.employeeId,
    } as any);
  }
  if (!audienceLocked) await replaceTargets(supabase, user.orgId, id, audienceType, targets);

  if (v.ack_required && !cur.ack_required) {
    // Acknowledgement switched on after publishing: snapshot the audience now.
    const added = await snapshotRecipients(supabase, user.orgId, id, audienceType, targets, "publish");
    fireAckRequested(supabase, user.orgId, id, v.title, added);
  } else if (reack) {
    const { data: recips } = await supabase
      .from("announcement_recipients")
      .select("employee_id")
      .eq("announcement_id", id)
      .eq("org_id", user.orgId);
    fireAckRequested(
      supabase,
      user.orgId,
      id,
      v.title,
      ((recips ?? []) as Array<{ employee_id: string }>).map((r) => r.employee_id)
    );
  }

  revalidateAnnouncementSurfaces();
  return { success: true, data: { reackTriggered: reack } };
}

/**
 * Hard-deletes an announcement with no acknowledgements. One that has any is
 * archived instead, so the acknowledgement audit trail survives.
 */
export async function deleteAnnouncement(id: string): Promise<ActionResult<{ archived: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can delete announcements" };

  const supabase = createAdminSupabase();
  const { count } = await supabase
    .from("announcement_acknowledgements")
    .select("id", { count: "exact", head: true })
    .eq("org_id", user.orgId)
    .eq("announcement_id", id);

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("announcements")
      .update({ archived_at: new Date().toISOString(), is_pinned: false } as any)
      .eq("id", id)
      .eq("org_id", user.orgId);
    if (error) return { success: false, error: error.message };
    revalidateAnnouncementSurfaces();
    return { success: true, data: { archived: true } };
  }

  const { error } = await supabase.from("announcements").delete().eq("id", id).eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };
  revalidateAnnouncementSurfaces();
  return { success: true, data: { archived: false } };
}

export async function togglePin(id: string, pinned: boolean): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can pin announcements" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("announcements")
    .update({ is_pinned: pinned })
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  revalidateAnnouncementSurfaces();
  return { success: true, data: undefined };
}

/**
 * Employee acknowledges an announcement. Idempotent: the unique
 * (announcement, employee, version) key turns a double click into a no-op.
 */
export async function acknowledgeAnnouncement(
  id: string
): Promise<ActionResult<{ acknowledged_at: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.employeeId) return { success: false, error: "Employee record not found" };

  const supabase = createAdminSupabase();
  const { data: ann } = await supabase
    .from("announcements")
    .select("id, ack_required, content_version")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .is("archived_at", null)
    .maybeSingle();
  if (!ann || !(ann as any).ack_required) return { success: false, error: "Announcement not found" };

  const { data: recipient } = await supabase
    .from("announcement_recipients")
    .select("employee_id")
    .eq("announcement_id", id)
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .maybeSingle();
  if (!recipient) return { success: false, error: "This announcement doesn't need your acknowledgement" };

  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const userAgent = h.get("user-agent") ?? null;

  const version = (ann as any).content_version as number;
  const { data: inserted, error } = await supabase
    .from("announcement_acknowledgements")
    .insert({
      org_id: user.orgId,
      announcement_id: id,
      employee_id: user.employeeId,
      version,
      ip_address: ip,
      user_agent: userAgent,
    } as any)
    .select("acknowledged_at")
    .single();

  let acknowledgedAt = (inserted as any)?.acknowledged_at as string | undefined;
  if (error) {
    if ((error as any).code !== "23505") return { success: false, error: error.message };
    // Already acknowledged this version — return the original record.
    const { data: existing } = await supabase
      .from("announcement_acknowledgements")
      .select("acknowledged_at")
      .eq("announcement_id", id)
      .eq("employee_id", user.employeeId)
      .eq("version", version)
      .maybeSingle();
    acknowledgedAt = (existing as any)?.acknowledged_at;
  }

  revalidateAnnouncementSurfaces();
  return { success: true, data: { acknowledged_at: acknowledgedAt ?? new Date().toISOString() } };
}

// ---- Admin: acknowledgement status ----

export type AckStatusEmployeeRow = {
  employee_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  department: string | null;
  state: AckState;
  acknowledged_at: string | null;
  last_reminded_at: string | null;
  reminder_count: number;
  added_reason: "publish" | "late_add";
};

export type AnnouncementAckStatus = {
  announcement: Pick<
    Announcement,
    "id" | "title" | "body" | "category" | "created_at" | "ack_due_date" | "ack_version" | "content_version"
  > & { ack_required: boolean; audience_label: string };
  totals: AckTotals;
  rows: AckStatusEmployeeRow[];
  late_joiners: Array<{ id: string; name: string }>;
};

export async function getAnnouncementAckStatus(id: string): Promise<ActionResult<AnnouncementAckStatus>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data: ann } = await supabase
    .from("announcements")
    .select("id, title, body, category, created_at, ack_required, ack_due_date, ack_version, content_version, audience_type")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .is("archived_at", null)
    .maybeSingle();
  if (!ann) return { success: false, error: "Announcement not found" };
  const a = ann as any;

  const [employees, targets, deptResult, recipResult, ackResult] = await Promise.all([
    loadOrgEmployees(supabase, user.orgId),
    loadTargets(supabase, user.orgId, [id]),
    supabase.from("departments").select("id, name").eq("org_id", user.orgId),
    supabase
      .from("announcement_recipients")
      .select("employee_id, last_reminded_at, reminder_count, added_reason")
      .eq("org_id", user.orgId)
      .eq("announcement_id", id),
    supabase
      .from("announcement_acknowledgements")
      .select("employee_id, version, acknowledged_at")
      .eq("org_id", user.orgId)
      .eq("announcement_id", id),
  ]);

  const deptName = new Map(((deptResult as any).data ?? []).map((d: any) => [d.id, d.name as string]));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const recipients = ((recipResult as any).data ?? []) as Array<{
    employee_id: string;
    last_reminded_at: string | null;
    reminder_count: number;
    added_reason: "publish" | "late_add";
  }>;
  const status = computeAckStatus({
    recipients,
    acks: ((ackResult as any).data ?? []) as any[],
    employees,
    ackVersion: a.ack_version,
    dueDate: a.ack_due_date,
    todayIst: istTodayDate(),
  });

  const recipById = new Map(recipients.map((r) => [r.employee_id, r]));
  const rows: AckStatusEmployeeRow[] = status.rows
    .map((r) => {
      const e = empById.get(r.employeeId);
      const rec = recipById.get(r.employeeId)!;
      return {
        employee_id: r.employeeId,
        name: fullName(e) ?? e?.email ?? "Former employee",
        email: e?.email ?? null,
        avatar_url: e?.avatar_url ?? null,
        department: e?.department_id ? ((deptName.get(e.department_id) as string | undefined) ?? null) : null,
        state: r.state,
        acknowledged_at: r.acknowledgedAt,
        last_reminded_at: rec.last_reminded_at,
        reminder_count: rec.reminder_count,
        added_reason: rec.added_reason,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));

  const audience = resolveAudienceIds({ audienceType: a.audience_type, targets, employees });
  const lateJoiners = a.ack_required
    ? findLateJoiners(
        audience,
        recipients.map((r) => r.employee_id)
      ).map((eid) => ({ id: eid, name: fullName(empById.get(eid)) ?? "Employee" }))
    : [];

  const audienceLabel =
    a.audience_type === "all"
      ? "Everyone"
      : targets
          .map((t) =>
            t.target_type === "department"
              ? ((deptName.get(t.target_id) as string | undefined) ?? "Department")
              : (fullName(empById.get(t.target_id)) ?? "Employee")
          )
          .join(", ");

  return {
    success: true,
    data: {
      announcement: {
        id: a.id,
        title: a.title,
        body: a.body,
        category: a.category ?? "general",
        created_at: a.created_at,
        ack_required: !!a.ack_required,
        ack_due_date: a.ack_due_date,
        ack_version: a.ack_version,
        content_version: a.content_version,
        audience_label: audienceLabel,
      },
      totals: status.totals,
      rows,
      late_joiners: lateJoiners,
    },
  };
}

export async function addLateJoiners(id: string): Promise<ActionResult<{ added: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data: ann } = await supabase
    .from("announcements")
    .select("id, title, ack_required, audience_type")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .is("archived_at", null)
    .maybeSingle();
  if (!ann || !(ann as any).ack_required) return { success: false, error: "Announcement not found" };
  const a = ann as any;

  const targets = await loadTargets(supabase, user.orgId, [id]);
  const added = await snapshotRecipients(supabase, user.orgId, id, a.audience_type, targets, "late_add");
  fireAckRequested(supabase, user.orgId, id, a.title, added);

  revalidatePath(`/dashboard/announcements/${id}`);
  revalidateAnnouncementSurfaces();
  return { success: true, data: { added: added.length } };
}

/**
 * Remind pending recipients (all of them, or the given subset). Each person is
 * reminded at most once per 24h; people inside the cooldown are skipped and
 * counted. Sends in-app + push, plus email where the employee has one.
 */
export async function remindAnnouncementAck(
  id: string,
  employeeIds?: string[]
): Promise<ActionResult<{ reminded: number; skippedCooldown: number; emailed: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const status = await getAnnouncementAckStatus(id);
  if (!status.success) return status;
  const { announcement, rows } = status.data;
  if (!announcement.ack_required) return { success: false, error: "Acknowledgement isn't required" };

  const wanted = employeeIds ? new Set(employeeIds) : null;
  const pending = rows.filter(
    (r) => (r.state === "pending" || r.state === "overdue") && (!wanted || wanted.has(r.employee_id))
  );
  const now = new Date();
  const { remind, cooldown } = splitRemindable(
    pending.map((r) => ({ employee_id: r.employee_id, last_reminded_at: r.last_reminded_at })),
    now
  );
  if (!remind.length) {
    return { success: true, data: { reminded: 0, skippedCooldown: cooldown.length, emailed: 0 } };
  }

  const supabase = createAdminSupabase();
  const byId = new Map(pending.map((r) => [r.employee_id, r]));
  // Stamp the cooldown first so a double-clicked "Remind" can't double-send.
  await supabase.from("announcement_recipients").upsert(
    remind.map((employee_id) => ({
      org_id: user.orgId,
      announcement_id: id,
      employee_id,
      added_reason: byId.get(employee_id)!.added_reason,
      last_reminded_at: now.toISOString(),
      reminder_count: (byId.get(employee_id)!.reminder_count ?? 0) + 1,
    })),
    { onConflict: "announcement_id,employee_id" }
  );

  await notifyAckRequested(supabase, {
    orgId: user.orgId,
    employeeIds: remind,
    announcementId: id,
    title: announcement.title,
    reminder: true,
  });

  const { data: emps } = await supabase
    .from("employees")
    .select("id, first_name, email")
    .eq("org_id", user.orgId)
    .in("id", remind);
  const due = announcement.ack_due_date;
  const emailed = await emailAckReminders({
    recipients: (emps ?? []) as any[],
    orgName: user.orgName,
    announcementId: id,
    title: announcement.title,
    dueDateLabel: due
      ? new Date(`${due}T00:00:00+05:30`).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        })
      : null,
    overdue: isOverdue(due, istTodayDate()),
  });

  revalidatePath(`/dashboard/announcements/${id}`);
  return { success: true, data: { reminded: remind.length, skippedCooldown: cooldown.length, emailed } };
}
