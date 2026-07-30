"use server";

import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { fetchAttendanceReportData } from "@/lib/reports/fetch-report-data";
import type { AttendanceReportData } from "@/lib/reports/attendance-report";
import type { ActionResult } from "@/types";

export async function getAttendanceReportData(params: {
  from: string;
  to: string;
  departmentId?: string | null;
}): Promise<ActionResult<AttendanceReportData>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  try {
    const sb = createAdminSupabase();
    const { data: org } = await sb.from("organizations").select("name").eq("id", user.orgId).single();
    const data = await fetchAttendanceReportData(user.orgId, org?.name ?? "Organization", params);
    return { success: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to build report";
    // Range-validation messages are user-facing; anything else is generic.
    const safe = msg.startsWith("Invalid date range") || msg.startsWith("Range too large") ? msg : "Failed to build report";
    if (safe !== msg) console.error("[attendance-reports] build failed:", msg);
    return { success: false, error: safe };
  }
}

export async function listReportDepartments(): Promise<ActionResult<{ id: string; name: string }[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const sb = createAdminSupabase();
  const { data, error } = await sb.from("departments").select("id, name").eq("org_id", user.orgId).order("name");
  if (error) return { success: false, error: "Failed to load departments" };
  return { success: true, data: (data ?? []) as { id: string; name: string }[] };
}
