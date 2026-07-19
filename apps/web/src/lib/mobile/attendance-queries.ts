import type { createAdminSupabase } from "@/lib/supabase/server";
import type { MobileTodayStatus } from "@jambahr/shared";
import { buildTodayStatus, type ShiftLite } from "./home-payload";

type Supabase = ReturnType<typeof createAdminSupabase>;

/**
 * The employee's active shift for `date` (latest assignment whose window covers
 * it). Mirrors getActiveShiftForEmployee (shifts.ts) but takes an explicit
 * orgId/employeeId so it never re-enters getCurrentUser (no active-org cookie
 * on mobile requests).
 */
export async function resolveActiveShift(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
  date: string,
): Promise<ShiftLite> {
  const { data } = await supabase
    .from("shift_assignments")
    .select("date_from, date_to, shifts(name, start_time, end_time)")
    .eq("org_id", orgId)
    .eq("employee_id", employeeId)
    .lte("date_from", date)
    .order("date_from", { ascending: false })
    .limit(5);

  const row = (data ?? []).find((r: any) => !r.date_to || r.date_to >= date);
  const shift = row ? (row as any).shifts : null;
  if (!shift) return null;
  return { name: shift.name, start_time: shift.start_time, end_time: shift.end_time };
}

/**
 * Load the live today-status (attendance rollup + shift) for one IST day.
 * Shared by GET /api/mobile/home and POST /api/mobile/attendance/punch.
 */
export async function loadTodayStatus(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
  date: string,
): Promise<MobileTodayStatus> {
  const [{ data: record }, shift] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("clock_in_at, clock_out_at, total_minutes")
      .eq("org_id", orgId)
      .eq("employee_id", employeeId)
      .eq("date", date)
      .maybeSingle(),
    resolveActiveShift(supabase, orgId, employeeId, date),
  ]);

  return buildTodayStatus((record as any) ?? null, shift);
}
