import { createAdminSupabase } from "@/lib/supabase/server";
import { getDirectReportIds } from "@/lib/managers";

/**
 * Returns the IDs of all non-terminated employees whose department is headed
 * by `managerEmployeeId` within the given org, unioned with all direct reports
 * (both reporting-manager slots).
 *
 * This is the canonical implementation — imported by shifts actions AND the
 * JambaGeo lead actions. Keeping it here (rather than in an action file) lets
 * server actions that are NOT marked "use server" call it without violating
 * Next.js constraints.
 */
export async function getManagerScopedEmployeeIds(
  orgId: string,
  managerEmployeeId: string,
): Promise<string[]> {
  const sb = createAdminSupabase();
  const { data: ownedDepts } = await sb
    .from("departments")
    .select("id")
    .eq("org_id", orgId)
    .eq("head_id", managerEmployeeId);
  const deptIds = (ownedDepts ?? []).map((d: any) => d.id);

  const deptMemberIds: string[] = [];
  if (deptIds.length > 0) {
    const { data: emps } = await sb
      .from("employees")
      .select("id")
      .eq("org_id", orgId)
      .in("department_id", deptIds)
      .neq("status", "terminated");
    deptMemberIds.push(...((emps ?? []) as { id: string }[]).map((e) => e.id));
  }

  // Union with direct reports (either reporting-manager slot) — spec 2026-07-15.
  // Accepted side effect: JambaGeo manager scope broadens identically.
  const reportIds = await getDirectReportIds(orgId, managerEmployeeId);
  return [...new Set([...deptMemberIds, ...reportIds])];
}
