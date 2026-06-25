/**
 * Zone resolution for multi-location attendance (Phase 1).
 *
 * Given an employee + attendance day, return the set of location ids whose punches
 * count toward that employee's daily record — i.e. the locations in the zone the
 * employee was assigned to, effective on that day. Latest `effective_from <= day`
 * wins (mirrors the shift-assignment resolution pattern); `effective_to` (if set)
 * must also cover the day.
 *
 * Returns `null` when the employee has no active zone assignment → the caller pools
 * ALL of the employee's punches (no-zone fallback, PRD §4.4) — preserving the
 * pre-zones behaviour so unassigned employees never regress.
 *
 * Plain module (called from the ingest path) using the service-role admin client.
 */

import type { createAdminSupabase } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createAdminSupabase>;

export async function resolveEmployeeZoneLocationIds(
  supabase: AdminClient,
  orgId: string,
  employeeId: string,
  istDate: string, // "YYYY-MM-DD"
): Promise<string[] | null> {
  // Most recent assignment that has started on/before the day.
  const { data: assignments } = await supabase
    .from("employee_zone_assignments")
    .select("zone_id, effective_from, effective_to")
    .eq("org_id", orgId)
    .eq("employee_id", employeeId)
    .lte("effective_from", istDate)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false }) // tie-break same-day reassignments
    .limit(1);

  const assignment = assignments?.[0] as
    | { zone_id: string; effective_from: string; effective_to: string | null }
    | undefined;

  // No assignment, or the latest one has already ended before this day → no zone.
  if (!assignment) return null;
  if (assignment.effective_to && assignment.effective_to < istDate) return null;

  const { data: zoneLocs } = await supabase
    .from("attendance_zone_locations")
    .select("location_id")
    .eq("zone_id", assignment.zone_id);

  // Assigned to a zone but the zone has no locations → empty set (nothing counts),
  // which is distinct from null (pool-all). Surfaces a misconfigured zone instead
  // of silently pooling everything.
  return (zoneLocs ?? []).map((r: any) => r.location_id as string);
}
