"use server";

import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import type { ActionResult } from "@/types";
import { isAdmin } from "@/lib/current-user";
import { LEAD_STAGES, type LeadStage } from "@/lib/geo/stages";
import { getManagerScopedEmployeeIds } from "@/lib/attendance/manager-scope";
import { computeLeadScope } from "./geo-leads";

export interface FunnelRow {
  stage: LeadStage;
  count: number;
}

export async function getLeadFunnel(
  filter: { from?: string; to?: string } = {},
): Promise<ActionResult<FunnelRow[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const sb = createAdminSupabase();
  let q = sb.from("leads").select("stage").eq("org_id", ctx.orgId);
  if (filter.from) q = q.gte("created_at", filter.from);
  if (filter.to) q = q.lte("created_at", filter.to);

  // Scope-filter
  if (!isAdmin(ctx.role) && ctx.employeeId) {
    const dept = await getManagerScopedEmployeeIds(ctx.orgId, ctx.employeeId);
    const scope = computeLeadScope(
      { role: ctx.role, employeeId: ctx.employeeId },
      { dept },
    );
    if (scope) {
      const parts: string[] = [];
      if (scope.inAssignedTo.length) parts.push(`assigned_to.in.(${scope.inAssignedTo.join(",")})`);
      if (scope.includeUnassigned) parts.push("assigned_to.is.null");
      if (parts.length === 0) {
        return { success: true, data: LEAD_STAGES.map(s => ({ stage: s, count: 0 })) };
      }
      q = q.or(parts.join(","));
    }
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  const counts: Record<string, number> = Object.fromEntries(LEAD_STAGES.map(s => [s, 0]));
  for (const r of data ?? []) counts[r.stage] = (counts[r.stage] ?? 0) + 1;

  return {
    success: true,
    data: LEAD_STAGES.map(stage => ({ stage, count: counts[stage] })),
  };
}

export async function getOverdueFollowUps(): Promise<
  ActionResult<{
    lead_id: string;
    lead_name: string;
    assignee_name: string | null;
    follow_up_date: string;
    days_overdue: number;
  }[]>
> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const today = new Date().toISOString().slice(0, 10);
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("lead_visits")
    .select(
      "follow_up_date, lead:leads!lead_visits_lead_id_fkey(id, name, assigned_to, assignee:employees!leads_assigned_to_fkey(first_name, last_name))",
    )
    .eq("org_id", ctx.orgId)
    .lt("follow_up_date", today)
    .not("follow_up_date", "is", null)
    // Phase 1: scope filter applied in JS below (PostgREST embed scope is awkward).
    // Safety cap on unfiltered fetch; reports page renders the result as a list
    // so 500 is well past any practical admin-view size.
    .limit(500);

  if (error) return { success: false, error: error.message };

  // Scope-filter in JS (PostgREST embed scope is hard to express)
  let dept: string[] = [];
  if (!isAdmin(ctx.role) && ctx.employeeId) {
    dept = await getManagerScopedEmployeeIds(ctx.orgId, ctx.employeeId);
  }

  const rows = (data ?? [])
    .map((r: any) => {
      if (!r.lead) return null;

      // Apply scope in JS
      if (!isAdmin(ctx.role)) {
        const assignedTo = r.lead.assigned_to;
        if (ctx.role === "manager") {
          if (assignedTo !== null && !dept.includes(assignedTo)) return null;
          // unassigned visible to managers
        } else {
          // employee: only own leads
          if (assignedTo !== ctx.employeeId) return null;
        }
      }

      const d = new Date(r.follow_up_date);
      const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
      return {
        lead_id: r.lead.id,
        lead_name: r.lead.name,
        assignee_name: r.lead.assignee
          ? `${r.lead.assignee.first_name ?? ""} ${r.lead.assignee.last_name ?? ""}`.trim() || null
          : null,
        follow_up_date: r.follow_up_date,
        days_overdue: days,
      };
    })
    .filter(Boolean) as any[];
  return { success: true, data: rows };
}

export async function getMyAssignedLeads(): Promise<ActionResult<{
  id: string; name: string; company: string | null; stage: LeadStage; updated_at: string;
}[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!ctx.employeeId) return { success: true, data: [] };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .select("id, name, company, stage, updated_at")
    .eq("org_id", ctx.orgId)
    .eq("assigned_to", ctx.employeeId)
    .order("updated_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as any };
}
