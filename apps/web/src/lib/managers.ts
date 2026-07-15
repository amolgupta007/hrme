// Single source of truth for the reporting-manager relationship (up to 2 slots).
// Plain module — NOT "use server" (gotcha #85). Spec:
// docs/superpowers/specs/2026-07-15-dual-reporting-managers-design.md
import { createAdminSupabase } from "@/lib/supabase/server";

export type ManagedEmployee = {
  reporting_manager_id: string | null;
  reporting_manager_2_id: string | null;
};

export function managerIdsOf(emp: ManagedEmployee): string[] {
  const ids = [emp.reporting_manager_id, emp.reporting_manager_2_id].filter(
    (id): id is string => !!id
  );
  return [...new Set(ids)];
}

export function isManagerOfEmployee(actorEmployeeId: string, emp: ManagedEmployee): boolean {
  return managerIdsOf(emp).includes(actorEmployeeId);
}

/** Non-terminated employees reporting to this manager via either slot. Org-scoped. */
export async function getDirectReportIds(
  orgId: string,
  managerEmployeeId: string
): Promise<string[]> {
  const sb = createAdminSupabase();
  const { data } = await sb
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .or(`reporting_manager_id.eq.${managerEmployeeId},reporting_manager_2_id.eq.${managerEmployeeId}`)
    .neq("status", "terminated");
  return ((data ?? []) as { id: string }[]).map((e) => e.id);
}
