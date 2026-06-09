"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import type { ActionResult, UserRole } from "@/types";
import { isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { LEAD_STAGES, mapStageToOutcome, type LeadStage } from "@/lib/geo/stages";
import { getManagerScopedEmployeeIds } from "@/lib/attendance/manager-scope";
import { sendLeadAssignedEmail } from "@/components/emails/lead-assigned-sender";

// ---- Schemas ----

export const LeadCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contact_phone: z.string().trim().max(40).nullish(),
  contact_email: z
    .string()
    .trim()
    .email()
    .nullish()
    .or(z.literal("").transform(() => null)),
  company: z.string().trim().max(160).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  address: z.string().trim().max(500).nullish(),
  assigned_to: z.string().uuid().nullish(),
  stage: z.enum(LEAD_STAGES).default("new"),
  value_inr: z.number().min(0).max(99_999_999.99).nullish(),
  source: z.string().trim().max(80).nullish(),
});

export const LeadUpdateSchema = LeadCreateSchema.partial();

export const StageUpdateSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  note: z.string().trim().max(500).optional(),
});

export const AssignSchema = z.object({
  employee_id: z.string().uuid().nullable(),
});

// ---- Scope helper (pure, exported for tests) ----

export interface ScopeContext {
  role: UserRole;
  employeeId: string | null;
}
export interface ScopeFilter {
  inAssignedTo: string[];
  includeUnassigned: boolean;
}

export function computeLeadScope(
  ctx: ScopeContext,
  deps: { dept: string[] },
): ScopeFilter | null {
  if (isAdmin(ctx.role)) return null; // null = unrestricted
  if (ctx.role === "manager") {
    return { inAssignedTo: deps.dept, includeUnassigned: true };
  }
  // employee
  return {
    inAssignedTo: ctx.employeeId ? [ctx.employeeId] : [],
    includeUnassigned: false,
  };
}

// ---- System visit builder (pure, exported for tests) ----

export function buildSystemVisitForStageMove(args: {
  leadId: string;
  orgId: string;
  employeeId: string;
  from: LeadStage;
  to: LeadStage;
  note?: string;
}): {
  lead_id: string;
  org_id: string;
  employee_id: string;
  outcome: string;
  notes: string;
  source: "web";
  system: true;
} | null {
  if (args.from === args.to) return null;
  const base = `Stage: ${args.from} → ${args.to}`;
  const notes = args.note ? `${base}. ${args.note}` : base;
  return {
    lead_id: args.leadId,
    org_id: args.orgId,
    employee_id: args.employeeId,
    outcome: mapStageToOutcome(args.to),
    notes,
    source: "web" as const,
    system: true as const,
  };
}

// ---- Row types ----

interface LeadRow {
  id: string;
  org_id: string;
  name: string;
  contact_phone: string | null;
  contact_email: string | null;
  company: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  assigned_to: string | null;
  stage: LeadStage;
  value_inr: number | null;
  source: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ListLeadsFilter {
  stage?: LeadStage;
  assigned_to?: string | "unassigned";
  search?: string;
  follow_up_due?: boolean;
}

// ---- Actions ----

export async function listLeads(
  filter: ListLeadsFilter = {},
): Promise<ActionResult<(LeadRow & { assignee_name: string | null })[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const sb = createAdminSupabase();
  let q = sb
    .from("leads")
    .select("*, assignee:employees!leads_assigned_to_fkey(first_name,last_name)")
    .eq("org_id", ctx.orgId)
    .order("updated_at", { ascending: false });

  if (filter.stage) q = q.eq("stage", filter.stage);
  if (filter.assigned_to === "unassigned") q = q.is("assigned_to", null);
  else if (filter.assigned_to) q = q.eq("assigned_to", filter.assigned_to);
  if (filter.search) {
    // Strip PostgREST structural chars to prevent .or() filter injection
    const safe = filter.search.replace(/[(),%*]/g, "");
    if (safe.length > 0) {
      const s = `%${safe}%`;
      q = q.or(`name.ilike.${s},company.ilike.${s},contact_email.ilike.${s}`);
    }
  }

  // Scope filter
  const dept =
    !isAdmin(ctx.role) && ctx.employeeId
      ? await getManagerScopedEmployeeIds(ctx.orgId, ctx.employeeId)
      : [];
  const scope = computeLeadScope(
    { role: ctx.role, employeeId: ctx.employeeId },
    { dept },
  );
  if (scope) {
    const parts: string[] = [];
    if (scope.inAssignedTo.length > 0) {
      parts.push(`assigned_to.in.(${scope.inAssignedTo.join(",")})`);
    }
    if (scope.includeUnassigned) {
      parts.push(`assigned_to.is.null`);
    }
    if (parts.length === 0) {
      return { success: true, data: [] };
    }
    q = q.or(parts.join(","));
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []).map((r: any) => ({
    ...(r as LeadRow),
    assignee_name: r.assignee
      ? `${r.assignee.first_name ?? ""} ${r.assignee.last_name ?? ""}`.trim() || null
      : null,
  }));
  return { success: true, data: rows };
}

export async function getLead(id: string): Promise<ActionResult<LeadRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Not found" };

  // Apply scope: non-admin must own / dept-own / be unassigned.
  if (!isAdmin(ctx.role)) {
    const dept = ctx.employeeId
      ? await getManagerScopedEmployeeIds(ctx.orgId, ctx.employeeId)
      : [];
    const allowed =
      data.assigned_to === null
        ? ctx.role === "manager"
        : ctx.role === "manager"
          ? dept.includes(data.assigned_to)
          : data.assigned_to === ctx.employeeId;
    if (!allowed) return { success: false, error: "Out of scope" };
  }

  return { success: true, data: data as LeadRow };
}

async function assertAssigneeInScope(
  ctx: NonNullable<Awaited<ReturnType<typeof getJambaGeoContext>>>,
  assigneeId: string | null,
): Promise<string | null> {
  if (isAdmin(ctx.role)) return null; // admin can assign anyone
  if (assigneeId === null) return null; // unassigned allowed
  if (!ctx.employeeId) return "Employee record missing";
  const dept = await getManagerScopedEmployeeIds(ctx.orgId, ctx.employeeId);
  if (!dept.includes(assigneeId)) return "Assignee is not in your department";
  return null;
}

export async function createLead(
  input: z.infer<typeof LeadCreateSchema>,
): Promise<ActionResult<LeadRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isManagerOrAbove(ctx.role)) return { success: false, error: "Manager+ only" };

  const parsed = LeadCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const scopeErr = await assertAssigneeInScope(ctx, parsed.data.assigned_to ?? null);
  if (scopeErr) return { success: false, error: scopeErr };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .insert({ ...parsed.data, org_id: ctx.orgId, created_by: ctx.employeeId })
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  // Fire assignment email if assigned at create time
  if (data.assigned_to) {
    waitUntil(sendLeadAssignedEmail({ leadId: data.id, assigneeId: data.assigned_to }));
  }

  revalidatePath("/dashboard/geo/leads");
  revalidatePath("/dashboard/geo/my-leads");
  return { success: true, data: data as LeadRow };
}

export async function updateLead(
  id: string,
  patch: z.infer<typeof LeadUpdateSchema>,
): Promise<ActionResult<LeadRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const parsed = LeadUpdateSchema.safeParse(patch);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  if (Object.keys(parsed.data).length === 0) {
    return { success: false, error: "No fields to update" };
  }

  // Permission: scope-check the existing lead
  const existing = await getLead(id);
  if (!existing.success) return existing;

  if (!isAdmin(ctx.role) && parsed.data.assigned_to !== undefined) {
    const scopeErr = await assertAssigneeInScope(ctx, parsed.data.assigned_to ?? null);
    if (scopeErr) return { success: false, error: scopeErr };
  }

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/leads");
  revalidatePath(`/dashboard/geo/leads/${id}`);
  return { success: true, data: data as LeadRow };
}

export async function updateLeadStage(
  id: string,
  next: { stage: LeadStage; note?: string },
): Promise<ActionResult<LeadRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const parsed = StageUpdateSchema.safeParse(next);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const existing = await getLead(id);
  if (!existing.success) return existing;
  if (existing.data.stage === parsed.data.stage) {
    return { success: true, data: existing.data }; // idempotent no-op
  }

  const sb = createAdminSupabase();
  const { data: updated, error } = await sb
    .from("leads")
    .update({ stage: parsed.data.stage })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  // Write system visit row (best-effort; non-blocking on failure)
  if (ctx.employeeId) {
    const sys = buildSystemVisitForStageMove({
      leadId: id,
      orgId: ctx.orgId,
      employeeId: ctx.employeeId,
      from: existing.data.stage,
      to: parsed.data.stage,
      note: parsed.data.note,
    });
    if (sys) {
      try {
        const { error: insertErr } = await sb.from("lead_visits").insert(sys);
        if (insertErr) {
          console.warn("[jambageo] lead_visit audit insert failed", insertErr);
        }
      } catch (err) {
        console.warn("[jambageo] lead_visit audit insert threw", err);
      }
    }
  }

  revalidatePath("/dashboard/geo/leads");
  revalidatePath(`/dashboard/geo/leads/${id}`);
  return { success: true, data: updated as LeadRow };
}

export async function assignLead(
  id: string,
  employee_id: string | null,
): Promise<ActionResult<LeadRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isManagerOrAbove(ctx.role)) return { success: false, error: "Manager+ only" };

  // Scope-check the existing lead (manager only sees own-dept + unassigned)
  const existing = await getLead(id);
  if (!existing.success) return existing;

  const scopeErr = await assertAssigneeInScope(ctx, employee_id);
  if (scopeErr) return { success: false, error: scopeErr };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .update({ assigned_to: employee_id })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  if (employee_id) {
    waitUntil(sendLeadAssignedEmail({ leadId: id, assigneeId: employee_id }));
  }

  revalidatePath("/dashboard/geo/leads");
  revalidatePath(`/dashboard/geo/leads/${id}`);
  revalidatePath("/dashboard/geo/my-leads");
  return { success: true, data: data as LeadRow };
}

export async function bulkAssignLeads(
  ids: string[],
  employee_id: string | null,
): Promise<ActionResult<{ updated: number }>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .update({ assigned_to: employee_id })
    .in("id", ids)
    .eq("org_id", ctx.orgId)
    .select("id");
  if (error) return { success: false, error: error.message };

  if (employee_id) {
    for (const row of data ?? []) {
      waitUntil(sendLeadAssignedEmail({ leadId: row.id, assigneeId: employee_id }));
    }
  }

  revalidatePath("/dashboard/geo/leads");
  return { success: true, data: { updated: (data ?? []).length } };
}

export async function deleteLead(id: string): Promise<ActionResult<void>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const sb = createAdminSupabase();
  const { error } = await sb
    .from("leads")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/leads");
  return { success: true, data: undefined };
}
