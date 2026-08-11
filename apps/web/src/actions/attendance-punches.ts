"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";
import { getManagerScopedEmployeeIds } from "@/lib/attendance/manager-scope";
import { recomputeAttendanceDay } from "@/lib/attendance/adms-ingest";
import {
  canApprovePunch,
  canVoidPunch,
  autoApproveOnAdd,
  type PunchActor,
} from "@/lib/attendance/punch-permissions";
import { validateManualPunch, istTodayDate } from "@/lib/attendance/manual-punch-validation";
import { managerIdsOf } from "@/lib/managers";
import { notifyApprovalPending } from "@/lib/mobile/notify";
import type { ActionResult } from "@/types";

export type PunchEventRow = {
  id: string;
  employee_id: string;
  punched_at: string;
  location_id: string | null;
  source: string;
  punch_type: "in" | "out" | "break_out" | "break_in" | null;
  status: "approved" | "pending" | "rejected" | "voided" | "duplicate";
  note: string | null;
  void_reason: string | null;
  rejection_reason: string | null;
  created_by: string | null;
};

/** IST calendar date (YYYY-MM-DD) of a UTC ISO instant. */
function istDateOfIso(iso: string): string {
  return new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Resolve the calling user's actor + manager scope. Null when unauthenticated / org-less. */
async function resolveActor(
  orgIdHint?: string | null // mobile BFF passes X-Org-Id; web omits → cookie path (byte-identical)
): Promise<
  { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; actor: PunchActor } | null
> {
  const user = await getCurrentUser({ orgIdHint });
  if (!user || !user.employeeId) return null;
  const scopedEmployeeIds =
    user.role === "manager"
      ? await getManagerScopedEmployeeIds(user.orgId, user.employeeId)
      : [];
  return {
    user,
    actor: { role: user.role, employeeId: user.employeeId, scopedEmployeeIds },
  };
}

/** True when the actor may view the target employee's punches. */
function canViewEmployee(actor: PunchActor, targetEmployeeId: string): boolean {
  if (actor.role === "owner" || actor.role === "admin") return true;
  if (actor.role === "manager") return actor.scopedEmployeeIds.includes(targetEmployeeId);
  return actor.employeeId === targetEmployeeId; // employees: self only
}

/** Best-effort punch audit — never blocks the primary mutation (gotcha #52). */
async function writeAudit(
  sb: ReturnType<typeof createAdminSupabase>,
  args: {
    orgId: string;
    punchEventId: string | null;
    action: "manual_add" | "approve" | "reject" | "void" | "dedupe" | "edit";
    actorId: string | null;
    actorRole: string;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    await sb.from("attendance_punch_audit").insert({
      org_id: args.orgId,
      punch_event_id: args.punchEventId,
      action: args.action,
      actor_id: args.actorId,
      actor_role: args.actorRole,
      reason: args.reason ?? null,
      metadata: args.metadata ?? null,
    });
  } catch (e) {
    console.warn("[punch-audit] write failed:", (e as Error).message);
  }
}

export async function listPunchEvents(input: {
  employeeId: string;
  date: string; // IST YYYY-MM-DD
}): Promise<ActionResult<PunchEventRow[]>> {
  const ctx = await resolveActor();
  if (!ctx) return { success: false, error: "Not authenticated" };
  if (!canViewEmployee(ctx.actor, input.employeeId))
    return { success: false, error: "Unauthorized" };

  const sb = createAdminSupabase();
  const start = new Date(`${input.date}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);

  const { data, error } = await sb
    .from("attendance_punch_events")
    .select(
      "id, employee_id, punched_at, location_id, source, punch_type, status, note, void_reason, rejection_reason, created_by",
    )
    .eq("org_id", ctx.user.orgId)
    .eq("employee_id", input.employeeId)
    .gte("punched_at", start.toISOString())
    .lt("punched_at", end.toISOString())
    .order("punched_at", { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as PunchEventRow[] };
}

const AddPunchSchema = z.object({
  employeeId: z.string().uuid(),
  // IST wall-clock from a <input type="datetime-local"> — "YYYY-MM-DDTHH:MM".
  punchedAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  punchType: z.enum(["in", "out"]),
  note: z.string().max(500).optional().nullable(),
});

export async function addManualPunch(
  input: z.infer<typeof AddPunchSchema>,
): Promise<ActionResult<{ id: string; status: string }>> {
  const ctx = await resolveActor();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const parsed = AddPunchSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const { employeeId, punchedAtLocal, punchType, note } = parsed.data;

  // Employees may add only for themselves. Managers within scope. Admins anyone.
  const isSelf = ctx.actor.employeeId === employeeId;
  if (!isSelf && !canApprovePunch(ctx.actor, employeeId))
    return { success: false, error: "Unauthorized" };

  const punchedAtIso = new Date(`${punchedAtLocal}:00+05:30`).toISOString();
  const istDate = punchedAtLocal.slice(0, 10);
  // Admin-added punches auto-approve; everyone else's land pending.
  const autoApprove = autoApproveOnAdd(ctx.actor);

  // No future punches (any actor); non-admins must supply a correction note.
  const validationError = validateManualPunch({
    istDate,
    todayIst: istTodayDate(),
    note,
    isAdmin: autoApprove,
  });
  if (validationError) return { success: false, error: validationError };

  const status = autoApprove ? "approved" : "pending";

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("attendance_punch_events")
    .insert({
      org_id: ctx.user.orgId,
      employee_id: employeeId,
      device_id: null,
      location_id: null,
      punched_at: punchedAtIso,
      source: "manual",
      punch_type: punchType,
      status,
      created_by: ctx.actor.employeeId,
      approved_by: autoApprove ? ctx.actor.employeeId : null,
      approved_at: autoApprove ? new Date().toISOString() : null,
      note: note ?? null,
      raw_payload: { manual: true, added_by_role: ctx.actor.role },
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  await writeAudit(sb, {
    orgId: ctx.user.orgId,
    punchEventId: (data as { id: string }).id,
    action: "manual_add",
    actorId: ctx.actor.employeeId,
    actorRole: ctx.actor.role,
    reason: note ?? null,
    metadata: { punch_type: punchType, punched_at: punchedAtIso, auto_approved: autoApprove },
  });

  await recomputeAttendanceDay(sb, ctx.user.orgId, employeeId, istDate);

  // Notify the employee's manager(s) that a regularization is waiting on
  // them (best-effort, own try/catch — must not affect the core action
  // above, which has already committed). Auto-approved punches (admin-added)
  // need no approver notification.
  if (status === "pending") {
    try {
      const { data: emp } = await sb
        .from("employees")
        .select("first_name, last_name, reporting_manager_id, reporting_manager_2_id, department_id")
        .eq("id", employeeId)
        .eq("org_id", ctx.user.orgId)
        .single();
      if (emp) {
        // Manager scope = dual reporting managers ∪ department head (the same
        // union `getManagerScopedEmployeeIds` uses in the other direction).
        const recipientIds = new Set(managerIdsOf(emp as any));
        const deptId = (emp as any).department_id as string | null;
        if (deptId) {
          const { data: dept } = await sb
            .from("departments")
            .select("head_id")
            .eq("id", deptId)
            .single();
          if ((dept as any)?.head_id) recipientIds.add((dept as any).head_id as string);
        }
        // Never notify the submitter about their own just-filed request.
        // The submitter is ctx.actor.employeeId, NOT the punch's target
        // employeeId — a manager filing a correction FOR a direct report
        // must not get pushed about the request they just filed (they'd
        // otherwise be in recipientIds as the report's manager/dept-head).
        // Also drop the target id itself in case the target is somehow
        // also in their own manager/dept-head chain.
        recipientIds.delete(ctx.actor.employeeId);
        recipientIds.delete(employeeId);
        const employeeName = `${(emp as any).first_name ?? ""} ${(emp as any).last_name ?? ""}`.trim();
        for (const recipientId of recipientIds) {
          await notifyApprovalPending(sb, {
            orgId: ctx.user.orgId,
            employeeId: recipientId,
            approvalType: "regularization",
            title: "Regularization request",
            body: `${employeeName || "An employee"} submitted a punch correction for review`,
          });
        }
      }
    } catch {
      // Push failure must not break the core action
    }
  }

  revalidatePath("/dashboard/attendance");
  return { success: true, data: { id: (data as { id: string }).id, status } };
}

/** Load a punch and confirm it belongs to the caller's org. */
async function loadPunch(sb: ReturnType<typeof createAdminSupabase>, orgId: string, punchId: string) {
  const { data } = await sb
    .from("attendance_punch_events")
    .select("id, org_id, employee_id, punched_at, status")
    .eq("id", punchId)
    .eq("org_id", orgId)
    .single();
  return data as
    | { id: string; org_id: string; employee_id: string; punched_at: string; status: string }
    | null;
}

export async function approvePunch(
  punchId: string,
  orgIdHint?: string | null // mobile BFF passes X-Org-Id; web omits → cookie path (byte-identical)
): Promise<ActionResult<void>> {
  const ctx = await resolveActor(orgIdHint);
  if (!ctx) return { success: false, error: "Not authenticated" };
  const sb = createAdminSupabase();
  const punch = await loadPunch(sb, ctx.user.orgId, punchId);
  if (!punch) return { success: false, error: "Punch not found" };
  if (!canApprovePunch(ctx.actor, punch.employee_id))
    return { success: false, error: "Unauthorized" };

  const { error } = await sb
    .from("attendance_punch_events")
    .update({
      status: "approved",
      approved_by: ctx.actor.employeeId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", punchId);
  if (error) return { success: false, error: error.message };

  await writeAudit(sb, {
    orgId: ctx.user.orgId,
    punchEventId: punchId,
    action: "approve",
    actorId: ctx.actor.employeeId,
    actorRole: ctx.actor.role,
  });
  await recomputeAttendanceDay(sb, ctx.user.orgId, punch.employee_id, istDateOfIso(punch.punched_at));
  revalidatePath("/dashboard/attendance");
  return { success: true, data: undefined };
}

export async function rejectPunch(
  punchId: string,
  reason: string,
  orgIdHint?: string | null // mobile BFF passes X-Org-Id; web omits → cookie path (byte-identical)
): Promise<ActionResult<void>> {
  const ctx = await resolveActor(orgIdHint);
  if (!ctx) return { success: false, error: "Not authenticated" };
  if (!reason || reason.trim().length === 0)
    return { success: false, error: "A reason is required" };
  const sb = createAdminSupabase();
  const punch = await loadPunch(sb, ctx.user.orgId, punchId);
  if (!punch) return { success: false, error: "Punch not found" };
  if (!canApprovePunch(ctx.actor, punch.employee_id))
    return { success: false, error: "Unauthorized" };

  const { error } = await sb
    .from("attendance_punch_events")
    .update({
      status: "rejected",
      rejected_by: ctx.actor.employeeId,
      rejected_at: new Date().toISOString(),
      rejection_reason: reason.trim(),
    })
    .eq("id", punchId);
  if (error) return { success: false, error: error.message };

  await writeAudit(sb, {
    orgId: ctx.user.orgId,
    punchEventId: punchId,
    action: "reject",
    actorId: ctx.actor.employeeId,
    actorRole: ctx.actor.role,
    reason: reason.trim(),
  });
  await recomputeAttendanceDay(sb, ctx.user.orgId, punch.employee_id, istDateOfIso(punch.punched_at));
  revalidatePath("/dashboard/attendance");
  return { success: true, data: undefined };
}

export async function voidPunch(punchId: string, reason: string): Promise<ActionResult<void>> {
  const ctx = await resolveActor();
  if (!ctx) return { success: false, error: "Not authenticated" };
  if (!canVoidPunch(ctx.actor)) return { success: false, error: "Unauthorized" };
  if (!reason || reason.trim().length === 0)
    return { success: false, error: "A reason is required" };
  const sb = createAdminSupabase();
  const punch = await loadPunch(sb, ctx.user.orgId, punchId);
  if (!punch) return { success: false, error: "Punch not found" };

  const { error } = await sb
    .from("attendance_punch_events")
    .update({
      status: "voided",
      voided_by: ctx.actor.employeeId,
      voided_at: new Date().toISOString(),
      void_reason: reason.trim(),
    })
    .eq("id", punchId);
  if (error) return { success: false, error: error.message };

  await writeAudit(sb, {
    orgId: ctx.user.orgId,
    punchEventId: punchId,
    action: "void",
    actorId: ctx.actor.employeeId,
    actorRole: ctx.actor.role,
    reason: reason.trim(),
  });
  await recomputeAttendanceDay(sb, ctx.user.orgId, punch.employee_id, istDateOfIso(punch.punched_at));
  revalidatePath("/dashboard/attendance");
  return { success: true, data: undefined };
}
