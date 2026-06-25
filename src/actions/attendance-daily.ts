"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { recomputeAttendanceDay } from "@/lib/attendance/adms-ingest";
import type { ActionResult } from "@/types";

export type DailyAttendanceRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  total_minutes: number | null;
  punch_count: number | null;
  out_of_zone_count: number | null;
  derived_status: "present" | "incomplete" | "absent" | null;
  first_in_location: string | null;
  last_out_location: string | null;
};

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" as const };
  if (!isAdmin(user.role)) return { error: "Unauthorized" as const };
  return { user };
}

/**
 * Admin daily-attendance view, scoped to device-sourced (multi-location) records.
 * `reviewOnly` narrows to the review queue: incomplete days or days with
 * out-of-zone punches — the rows that need a human look.
 */
export async function getDailyAttendance(input: {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  reviewOnly?: boolean;
}): Promise<ActionResult<DailyAttendanceRow[]>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("attendance_records")
    .select(
      `id, employee_id, date, clock_in_at, clock_out_at, total_minutes,
       punch_count, out_of_zone_count, derived_status,
       employees(first_name, last_name),
       first_in:locations!first_in_location_id(name),
       last_out:locations!last_out_location_id(name)`,
    )
    .eq("org_id", ctx.user.orgId)
    .gte("date", input.from)
    .lte("date", input.to)
    // Only rows produced by the event/zone pipeline carry derived_status.
    .not("derived_status", "is", null)
    .order("date", { ascending: false });

  if (error) return { success: false, error: error.message };

  let rows: DailyAttendanceRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employees
      ? `${r.employees.first_name} ${r.employees.last_name}`
      : "—",
    date: r.date,
    clock_in_at: r.clock_in_at,
    clock_out_at: r.clock_out_at,
    total_minutes: r.total_minutes,
    punch_count: r.punch_count,
    out_of_zone_count: r.out_of_zone_count,
    derived_status: r.derived_status,
    first_in_location: r.first_in?.name ?? null,
    last_out_location: r.last_out?.name ?? null,
  }));

  if (input.reviewOnly) {
    rows = rows.filter(
      (r) => r.derived_status === "incomplete" || (r.out_of_zone_count ?? 0) > 0,
    );
  }

  return { success: true, data: rows };
}

/** Re-derive a single (employee, day) rollup from its punch events. Admin correction. */
export async function recalculateDay(
  employeeId: string,
  date: string,
): Promise<ActionResult<void>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const supabase = createAdminSupabase();
  // Confirm the employee is in the caller's org before touching their record.
  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("id", employeeId)
    .eq("org_id", ctx.user.orgId)
    .maybeSingle();
  if (!emp) return { success: false, error: "Employee not found" };

  try {
    await recomputeAttendanceDay(supabase, ctx.user.orgId, employeeId, date);
  } catch (e) {
    return { success: false, error: (e as Error)?.message ?? "Recalculation failed" };
  }
  revalidatePath("/dashboard/attendance");
  return { success: true, data: undefined };
}
