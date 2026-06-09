"use server";

import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import type { ActionResult } from "@/types";
import { isAdmin } from "@/lib/current-user";
import { getManagerScopedEmployeeIds } from "@/lib/attendance/manager-scope";

export interface ActiveSessionView {
  session_id: string;
  employee_id: string;
  employee_name: string;
  started_at: string;
  last_ping_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
}

export async function listActiveSessions(): Promise<ActionResult<ActiveSessionView[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const sb = createAdminSupabase();
  let q = sb
    .from("duty_sessions")
    .select(
      "id, employee_id, started_at, last_ping_at, last_lat, last_lng, employee:employees!duty_sessions_employee_id_fkey(first_name, last_name)",
    )
    .eq("org_id", ctx.orgId)
    .eq("status", "active");

  if (!isAdmin(ctx.role) && ctx.employeeId) {
    const dept = await getManagerScopedEmployeeIds(ctx.orgId, ctx.employeeId);
    if (dept.length === 0) return { success: true, data: [] };
    q = q.in("employee_id", dept);
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []).map((r: any) => ({
    session_id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employee
      ? `${r.employee.first_name ?? ""} ${r.employee.last_name ?? ""}`.trim()
      : "Unknown",
    started_at: r.started_at,
    last_ping_at: r.last_ping_at,
    last_lat: r.last_lat,
    last_lng: r.last_lng,
  }));
  return { success: true, data: rows };
}

export async function listSessionPings(session_id: string): Promise<ActionResult<{
  id: string; lat: number; lng: number; captured_at: string;
}[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("location_pings")
    .select("id, lat, lng, captured_at")
    .eq("session_id", session_id)
    .eq("org_id", ctx.orgId)
    .order("captured_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as any };
}

// ---- Phase 2 stubs (mobile-only writers; throw if called from web) ----

export async function startSession(): Promise<ActionResult<never>> {
  return { success: false, error: "TODO(PRD 04): mobile-only action" };
}
export async function endSession(): Promise<ActionResult<never>> {
  return { success: false, error: "TODO(PRD 04): mobile-only action" };
}
export async function ingestPings(): Promise<ActionResult<never>> {
  return { success: false, error: "TODO(PRD 04): mobile-only action" };
}
