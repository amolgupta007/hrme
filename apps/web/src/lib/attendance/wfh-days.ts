// Plain module (NOT "use server" — gotcha #85): approved work-from-home days,
// for attendance views and reports. WFH is a working day, so callers show it
// as "WFH" next to the attendance — never as leave.
import type { createAdminSupabase } from "@/lib/supabase/server";

/** employee_id → set of YYYY-MM-DD with an APPROVED WFH request in [from, to]. */
export async function loadApprovedWfhDays(
  supabase: ReturnType<typeof createAdminSupabase>,
  orgId: string,
  from: string,
  to: string,
  employeeIds?: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (employeeIds && employeeIds.length === 0) return out;
  let q = supabase
    .from("wfh_requests")
    .select("employee_id, date")
    .eq("org_id", orgId)
    .eq("status", "approved")
    .gte("date", from)
    .lte("date", to);
  if (employeeIds) q = q.in("employee_id", employeeIds);
  const { data, error } = await q;
  // Table missing (migration 113 not applied) or any read error → no WFH days,
  // never a broken attendance page.
  if (error) return out;
  for (const r of (data ?? []) as Array<{ employee_id: string; date: string }>) {
    if (!out.has(r.employee_id)) out.set(r.employee_id, new Set());
    out.get(r.employee_id)!.add(r.date);
  }
  return out;
}
