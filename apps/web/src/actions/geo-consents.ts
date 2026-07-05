"use server";

import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import type { ActionResult } from "@/types";
import { isAdmin } from "@/lib/current-user";

interface ConsentRow {
  id: string;
  org_id: string;
  employee_id: string;
  granted_at: string | null;
  revoked_at: string | null;
  retention_days: number;
  app_version: string | null;
  created_at: string;
  updated_at: string;
}

export async function listConsents(): Promise<
  ActionResult<(ConsentRow & { employee_name: string | null })[]>
> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("geo_consents")
    .select(
      "*, employee:employees!geo_consents_employee_id_fkey(first_name, last_name)",
    )
    .eq("org_id", ctx.orgId)
    .order("updated_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []).map((r: any) => ({
    ...(r as ConsentRow),
    employee_name: r.employee
      ? `${r.employee.first_name ?? ""} ${r.employee.last_name ?? ""}`.trim() || null
      : null,
  }));
  return { success: true, data: rows };
}

export async function recordConsent(): Promise<ActionResult<never>> {
  return { success: false, error: "TODO(PRD 04): mobile-only action" };
}
export async function revokeConsent(): Promise<ActionResult<never>> {
  return { success: false, error: "TODO(PRD 04): mobile-only action" };
}
