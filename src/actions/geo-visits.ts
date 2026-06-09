"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import type { ActionResult } from "@/types";
import { isAdmin } from "@/lib/current-user";
import { LEAD_OUTCOMES, mapOutcomeToStage, type LeadOutcome } from "@/lib/geo/stages";
import { getLead } from "./geo-leads";
import { VisitCreateSchema, VisitUpdateSchema } from "@/lib/geo/geo-schemas";

interface VisitRow {
  id: string;
  lead_id: string;
  org_id: string;
  employee_id: string;
  session_id: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  outcome: LeadOutcome;
  follow_up_date: string | null;
  photo_url: string | null;
  source: "web" | "mobile";
  system: boolean;
  visited_at: string;
  created_at: string;
}

export async function listLeadVisits(
  lead_id: string,
): Promise<ActionResult<(VisitRow & { employee_name: string | null })[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  // Scope enforced via getLead (re-uses leads scope filter)
  const lead = await getLead(lead_id);
  if (!lead.success) return { success: false, error: lead.error };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("lead_visits")
    .select("*, employee:employees!lead_visits_employee_id_fkey(first_name,last_name)")
    .eq("lead_id", lead_id)
    .eq("org_id", ctx.orgId)
    .order("visited_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []).map((r: any) => ({
    ...(r as VisitRow),
    employee_name: r.employee
      ? `${r.employee.first_name ?? ""} ${r.employee.last_name ?? ""}`.trim() || null
      : null,
  }));
  return { success: true, data: rows };
}

export async function createLeadVisit(
  input: z.infer<typeof VisitCreateSchema>,
): Promise<ActionResult<VisitRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const parsed = VisitCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  // Scope check via parent lead
  const lead = await getLead(parsed.data.lead_id);
  if (!lead.success) return { success: false, error: lead.error };

  if (!ctx.employeeId) return { success: false, error: "No employee record" };

  const sb = createAdminSupabase();
  const { data: visit, error: vErr } = await sb
    .from("lead_visits")
    .insert({
      lead_id: parsed.data.lead_id,
      org_id: ctx.orgId,
      employee_id: ctx.employeeId,
      notes: parsed.data.notes ?? null,
      outcome: parsed.data.outcome,
      follow_up_date: parsed.data.follow_up_date ?? null,
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
      source: "web",
      system: false,
    })
    .select("*")
    .single();
  if (vErr) return { success: false, error: vErr.message };

  // Auto-flip lead stage on terminal outcomes
  const targetStage = mapOutcomeToStage(parsed.data.outcome);
  if (targetStage && targetStage !== lead.data.stage) {
    const { error: stageErr } = await sb
      .from("leads")
      .update({ stage: targetStage })
      .eq("id", parsed.data.lead_id)
      .eq("org_id", ctx.orgId);
    if (stageErr) {
      console.warn(
        "[jambageo] auto-stage-flip on lead failed after visit insert",
        { leadId: parsed.data.lead_id, targetStage, error: stageErr },
      );
    }
  }

  revalidatePath("/dashboard/geo/leads");
  revalidatePath(`/dashboard/geo/leads/${parsed.data.lead_id}`);
  revalidatePath("/dashboard/geo/my-leads");
  return { success: true, data: visit as VisitRow };
}

export async function updateLeadVisit(
  id: string,
  patch: z.infer<typeof VisitUpdateSchema>,
): Promise<ActionResult<VisitRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const parsed = VisitUpdateSchema.safeParse(patch);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  if (Object.keys(parsed.data).length === 0) {
    return { success: false, error: "No fields to update" };
  }

  const sb = createAdminSupabase();
  const { data: existing, error: eErr } = await sb
    .from("lead_visits")
    .select("*")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (eErr) return { success: false, error: eErr.message };
  if (!existing) return { success: false, error: "Not found" };

  // Author + admin can edit; system rows are immutable.
  if (existing.system) return { success: false, error: "System rows are immutable" };
  if (!isAdmin(ctx.role) && existing.employee_id !== ctx.employeeId) {
    return { success: false, error: "Author only" };
  }

  const { data, error } = await sb
    .from("lead_visits")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/leads");
  revalidatePath(`/dashboard/geo/leads/${existing.lead_id}`);
  return { success: true, data: data as VisitRow };
}

export async function deleteLeadVisit(id: string): Promise<ActionResult<void>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const sb = createAdminSupabase();
  const { data: existing, error: eErr } = await sb
    .from("lead_visits")
    .select("system, lead_id")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (eErr) return { success: false, error: eErr.message };
  if (!existing) return { success: false, error: "Not found" };
  if (existing.system) return { success: false, error: "System rows cannot be deleted" };

  const { error } = await sb
    .from("lead_visits")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/leads");
  revalidatePath(`/dashboard/geo/leads/${existing.lead_id}`);
  return { success: true, data: undefined };
}
