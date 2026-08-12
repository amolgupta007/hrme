import type { createAdminSupabase } from "@/lib/supabase/server";
import type { MobileTodayStatus, MobilePunchGeo } from "@jambahr/shared";
import { toPunchGeoDto } from "@/lib/attendance/location-punch";
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
  const [{ data: record }, shift, lastPunchGeo] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("clock_in_at, clock_out_at, total_minutes")
      .eq("org_id", orgId)
      .eq("employee_id", employeeId)
      .eq("date", date)
      .maybeSingle(),
    resolveActiveShift(supabase, orgId, employeeId, date),
    loadLastPunchGeo(supabase, orgId, employeeId, date),
  ]);

  return buildTodayStatus((record as any) ?? null, shift, lastPunchGeo);
}

/**
 * The location verdict on the employee's most recent evaluated punch for `date`.
 *
 * Read from `attendance_punch_events` rather than the daily rollup: the rollup
 * carries no geo columns (deliberately — see migration 107's note), and the
 * verdict is per-punch anyway (clock in at the office, clock out from home).
 *
 * Best-effort: any failure returns null ("not evaluated"), which the client
 * renders as no chip. A missing tag must never break the Home screen.
 */
export async function loadLastPunchGeo(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
  date: string,
): Promise<MobilePunchGeo | null> {
  try {
    // The IST day bounds: punch events are timestamptz, the rollup is by IST date.
    const from = `${date}T00:00:00+05:30`;
    const to = `${date}T23:59:59.999+05:30`;

    const { data, error } = await supabase
      .from("attendance_punch_events")
      .select("geo_status, geo_label, matched_location_id")
      .eq("org_id", orgId)
      .eq("employee_id", employeeId)
      .eq("status", "approved")
      .gte("punched_at", from)
      .lte("punched_at", to)
      .not("geo_status", "is", null)
      .order("punched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    // Cast: generated Supabase types predate migration 107 (geo_status/geo_label/
    // matched_location_id) → the select infers an error type (gotcha #3).
    return toPunchGeoDto(data as unknown as Record<string, string | null>);
  } catch {
    return null;
  }
}
