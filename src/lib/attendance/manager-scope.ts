import { createAdminSupabase } from "@/lib/supabase/server";

/**
 * Returns the IDs of all non-terminated employees whose department is headed
 * by `managerEmployeeId` within the given org.
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
  if (deptIds.length === 0) return [];
  const { data: emps } = await sb
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .in("department_id", deptIds)
    .neq("status", "terminated");
  return (emps ?? []).map((e: any) => e.id);
}
