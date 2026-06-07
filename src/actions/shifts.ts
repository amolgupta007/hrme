"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";
import { computeShiftTotalHours, isOvernight } from "@/lib/attendance/shift-time";

export type Shift = {
  id: string;
  org_id: string;
  name: string;
  start_time: string;
  end_time: string;
  total_hours: number;
  break_minutes: number;
  grace_minutes: number;
  half_day_threshold_minutes: number;
  is_overnight: boolean;
  is_default: boolean;
  ot_eligible: boolean;
  active: boolean;
};

export type ShiftAssignment = {
  id: string;
  org_id: string;
  employee_id: string;
  employee_name?: string | null;
  shift_id: string;
  shift_name?: string | null;
  date_from: string;
  date_to: string | null;
  assigned_by: string | null;
  notes: string | null;
};

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid HH:MM");
const ShiftInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  start_time: HHMM,
  end_time: HHMM,
  break_minutes: z.number().int().min(0).max(720).default(0),
  grace_minutes: z.number().int().min(0).max(120).default(0),
  half_day_threshold_minutes: z.number().int().min(30).max(720).default(240),
  is_default: z.boolean().default(false),
  ot_eligible: z.boolean().default(true),
  active: z.boolean().default(true),
});

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" as const };
  if (!isAdmin(user.role)) return { error: "Only admins can manage shifts" as const };
  return { user };
}

/**
 * Returns the set of employee IDs a manager can operate on (own department(s)
 * via departments.head_id). Admins see all. Returns [] = no scope (e.g.
 * manager not assigned as any department's head); caller decides whether to allow.
 */
async function getManagerScopedEmployeeIds(orgId: string, managerEmployeeId: string): Promise<string[]> {
  const sb = createAdminSupabase();
  const { data: ownedDepts } = await sb
    .from("departments")
    .select("id")
    .eq("org_id", orgId)
    .eq("head_id", managerEmployeeId);
  const deptIds = (ownedDepts ?? []).map((d: any) => d.id);
  if (deptIds.length === 0) return [];
  const { data: emps } = await sb
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .in("department_id", deptIds)
    .neq("status", "terminated");
  return (emps ?? []).map((e: any) => e.id);
}

/** Like requireAdmin but allows managers with explicit dept-scope. */
async function requireAdminOrManager() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" as const };
  if (!isAdmin(user.role) && user.role !== "manager") {
    return { error: "Insufficient permissions" as const };
  }
  return { user };
}

export async function listShifts(): Promise<ActionResult<Shift[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  await bootstrapDefaultShiftIfMissing(user.orgId);
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("shifts")
    .select("*")
    .eq("org_id", user.orgId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as Shift[] };
}

export async function upsertShift(input: unknown): Promise<ActionResult<Shift>> {
  const guard = await requireAdmin();
  if ("error" in guard) return { success: false, error: guard.error };
  const parsed = ShiftInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;
  let total_hours: number;
  try {
    total_hours = computeShiftTotalHours(v.start_time, v.end_time, v.break_minutes);
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Invalid shift duration" };
  }
  const overnight = isOvernight(v.start_time, v.end_time);

  const sb = createAdminSupabase();
  // If is_default, clear any existing default for this org first.
  if (v.is_default) {
    await sb.from("shifts").update({ is_default: false } as any).eq("org_id", guard.user.orgId).eq("is_default", true);
  }

  const row = {
    org_id: guard.user.orgId,
    name: v.name,
    start_time: v.start_time,
    end_time: v.end_time,
    total_hours,
    break_minutes: v.break_minutes,
    grace_minutes: v.grace_minutes,
    half_day_threshold_minutes: v.half_day_threshold_minutes,
    is_overnight: overnight,
    is_default: v.is_default,
    ot_eligible: v.ot_eligible,
    active: v.active,
  };

  const query = v.id
    ? sb.from("shifts").update(row as any).eq("id", v.id).eq("org_id", guard.user.orgId).select("*").single()
    : sb.from("shifts").insert(row as any).select("*").single();

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: data as Shift };
}

export async function setDefaultShift(shiftId: string): Promise<ActionResult<void>> {
  const guard = await requireAdmin();
  if ("error" in guard) return { success: false, error: guard.error };
  const sb = createAdminSupabase();
  await sb.from("shifts").update({ is_default: false } as any).eq("org_id", guard.user.orgId).eq("is_default", true);
  const { error } = await sb.from("shifts").update({ is_default: true } as any).eq("id", shiftId).eq("org_id", guard.user.orgId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

export async function deactivateShift(shiftId: string): Promise<ActionResult<void>> {
  const guard = await requireAdmin();
  if ("error" in guard) return { success: false, error: guard.error };
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("shifts")
    .update({ active: false, is_default: false } as any)
    .eq("id", shiftId)
    .eq("org_id", guard.user.orgId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

/**
 * Phase-1 bootstrap (OD-5): if an org with attendance enabled has no shifts yet,
 * seed a single default shift from its existing `standard_workday_hours`.
 * Idempotent — only inserts when zero shifts exist.
 */
export async function bootstrapDefaultShiftIfMissing(orgId: string): Promise<void> {
  const sb = createAdminSupabase();
  const { count } = await sb.from("shifts").select("*", { count: "exact", head: true }).eq("org_id", orgId);
  if ((count ?? 0) > 0) return;

  const { data: orgRow } = await sb.from("organizations").select("settings").eq("id", orgId).single();
  const rawHours = (orgRow as any)?.settings?.attendance?.standard_workday_hours;
  const hours = typeof rawHours === "number" && Number.isFinite(rawHours) ? Math.max(1, Math.min(16, rawHours)) : 8;
  const endHour = (9 + Math.round(hours)) % 24;
  const end_time = `${String(endHour).padStart(2, "0")}:00`;

  const { error: insertErr } = await sb.from("shifts").insert({
    org_id: orgId,
    name: "General",
    start_time: "09:00",
    end_time,
    total_hours: hours,
    break_minutes: 0,
    grace_minutes: 0,
    half_day_threshold_minutes: 240,
    is_overnight: false,
    is_default: true,
    ot_eligible: true,
    active: true,
  } as any);

  // Race tolerance: two concurrent first-open `listShifts` calls can both see
  // count=0 and both attempt to seed. The unique partial index on
  // `(org_id, lower(name))` makes the second insert fail with 23505. That's
  // the intended outcome — both callers see the same seeded shift on their
  // next read. Surface any other error so genuine failures don't disappear.
  if (insertErr && (insertErr as any).code !== "23505") {
    console.warn("bootstrapDefaultShiftIfMissing: insert failed", insertErr);
  }
}

export async function listShiftAssignments(): Promise<ActionResult<ShiftAssignment[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("shift_assignments")
    .select(`id, org_id, employee_id, shift_id, date_from, date_to, assigned_by, notes,
             employees!shift_assignments_employee_id_fkey(first_name, last_name),
             shifts(name)`)
    .eq("org_id", user.orgId)
    .order("date_from", { ascending: false });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      org_id: r.org_id,
      employee_id: r.employee_id,
      employee_name: r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : null,
      shift_id: r.shift_id,
      shift_name: r.shifts?.name ?? null,
      date_from: r.date_from,
      date_to: r.date_to,
      assigned_by: r.assigned_by,
      notes: r.notes,
    })),
  };
}

const AssignSchema = z.object({
  shift_id: z.string().uuid(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(500).optional(),
});

export async function assignShiftToEmployees(input: {
  employee_ids: string[];
  shift_id: string;
  date_from: string;
  date_to?: string | null;
  notes?: string;
}): Promise<ActionResult<{ inserted: number }>> {
  const guard = await requireAdmin();
  if ("error" in guard) return { success: false, error: guard.error };
  const parsed = AssignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (!Array.isArray(input.employee_ids) || input.employee_ids.length === 0) {
    return { success: false, error: "Pick at least one employee" };
  }
  const sb = createAdminSupabase();

  // Cross-tenant guard: every employee_id and the shift_id must belong to the caller's org.
  const { data: validEmps } = await sb
    .from("employees")
    .select("id")
    .eq("org_id", guard.user.orgId)
    .in("id", input.employee_ids);
  const validEmpIds = new Set((validEmps ?? []).map((e: any) => e.id as string));
  const foreignEmpIds = input.employee_ids.filter((id) => !validEmpIds.has(id));
  if (foreignEmpIds.length > 0) {
    return { success: false, error: "One or more employees do not belong to your organization" };
  }

  const { data: shiftRow } = await sb
    .from("shifts")
    .select("id")
    .eq("org_id", guard.user.orgId)
    .eq("id", parsed.data.shift_id)
    .maybeSingle();
  if (!shiftRow) {
    return { success: false, error: "Shift does not belong to your organization" };
  }

  const rows = input.employee_ids.map((empId) => ({
    org_id: guard.user.orgId,
    employee_id: empId,
    shift_id: parsed.data.shift_id,
    date_from: parsed.data.date_from,
    date_to: parsed.data.date_to ?? null,
    assigned_by: guard.user.employeeId,
    notes: parsed.data.notes ?? null,
  }));
  const { error, data } = await sb.from("shift_assignments").insert(rows as any).select("id");
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: { inserted: (data ?? []).length } };
}

export async function assignShiftToDepartment(input: {
  department_id: string;
  shift_id: string;
  date_from: string;
  date_to?: string | null;
  notes?: string;
}): Promise<ActionResult<{ inserted: number }>> {
  const guard = await requireAdmin();
  if ("error" in guard) return { success: false, error: guard.error };
  const sb = createAdminSupabase();
  const { data: emps } = await sb
    .from("employees")
    .select("id")
    .eq("org_id", guard.user.orgId)
    .eq("department_id", input.department_id)
    .neq("status", "terminated");
  const employee_ids = (emps ?? []).map((e: any) => e.id);
  if (employee_ids.length === 0) return { success: false, error: "Department has no active employees" };
  return assignShiftToEmployees({ ...input, employee_ids });
}

/**
 * Returns the active shift for an employee on a given IST date, if any.
 * Phase 1 rule: latest `date_from <= date` wins; ignored if `date_to < date`.
 *
 * Security: caller MUST be authenticated and the requested `employeeId` MUST
 * match the caller's own employee row (Phase 1 surfaces only self-lookup;
 * admin lookups go through `listShiftAssignments`). Hard-rejects cross-employee
 * reads to prevent shift-data enumeration via the Server Action surface.
 */
export async function getActiveShiftForEmployee(employeeId: string, date: string): Promise<Shift | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.employeeId !== employeeId) return null;
  const sb = createAdminSupabase();
  const { data } = await sb
    .from("shift_assignments")
    .select(`shift_id, date_from, date_to, shifts(*)`)
    .eq("org_id", user.orgId)
    .eq("employee_id", employeeId)
    .lte("date_from", date)
    .order("date_from", { ascending: false })
    .limit(5);
  const row = (data ?? []).find((r: any) => !r.date_to || r.date_to >= date);
  return row ? ((row as any).shifts as Shift) : null;
}
