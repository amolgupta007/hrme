"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import type { ActionResult, UserRole } from "@/types";
import { isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { LEAD_STAGES, mapStageToOutcome, type LeadStage } from "@/lib/geo/stages";
import {
  computeLeadScope,
  buildSystemVisitForStageMove,
  type ScopeContext,
  type ScopeFilter,
} from "@/lib/geo/lead-scope";
import {
  LeadCreateSchema,
  LeadUpdateSchema,
  StageUpdateSchema,
} from "@/lib/geo/geo-schemas";
import { getManagerScopedEmployeeIds } from "@/lib/attendance/manager-scope";
import { sendLeadAssignedEmail } from "@/components/emails/lead-assigned-sender";
import { geocodeAddress } from "@/lib/geo/geocode";

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

  // Auto-geocode: if the caller provided an address but no coordinates,
  // attempt a Mapbox forward-geocode and persist the result alongside the
  // lead. Best-effort — geocoder failures don't block the create.
  const payload: z.infer<typeof LeadCreateSchema> = { ...parsed.data };
  if (payload.address && payload.lat == null && payload.lng == null) {
    const hit = await geocodeAddress(payload.address);
    if (hit) {
      payload.lat = hit.lat;
      payload.lng = hit.lng;
    }
  }

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .insert({ ...payload, org_id: ctx.orgId, created_by: ctx.employeeId })
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  // Fire assignment email if assigned at create time
  if (data.assigned_to) {
    waitUntil(sendLeadAssignedEmail({ leadId: data.id, assigneeId: data.assigned_to }));
  }

  revalidatePath("/geo/leads");
  revalidatePath("/geo/my-leads");
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

  // Auto-geocode on address change: if the patch sets a new address and
  // doesn't explicitly override lat/lng, re-geocode. Comparing against the
  // existing row prevents needless geocoder calls on patches that touch
  // other fields. Best-effort — failure leaves lat/lng untouched.
  const patchToApply: z.infer<typeof LeadUpdateSchema> = { ...parsed.data };
  const addressChanged =
    patchToApply.address !== undefined &&
    patchToApply.address !== existing.data.address;
  const coordsUntouched =
    patchToApply.lat === undefined && patchToApply.lng === undefined;
  if (addressChanged && coordsUntouched) {
    const hit = await geocodeAddress(patchToApply.address);
    if (hit) {
      patchToApply.lat = hit.lat;
      patchToApply.lng = hit.lng;
    } else if (patchToApply.address === null) {
      // Address cleared → drop coords too so we don't keep a stale pin.
      patchToApply.lat = null;
      patchToApply.lng = null;
    }
  }

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .update(patchToApply)
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/geo/leads");
  revalidatePath(`/geo/leads/${id}`);
  return { success: true, data: data as LeadRow };
}

/**
 * Manual re-geocode for a lead — used by the "Re-geocode address" link on
 * the lead detail page when the auto-geocode silently failed (network
 * hiccup, ambiguous address, etc.) and the admin wants to retry without
 * editing the address.
 */
export async function geocodeLead(id: string): Promise<ActionResult<LeadRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isManagerOrAbove(ctx.role)) return { success: false, error: "Manager+ only" };

  const existing = await getLead(id);
  if (!existing.success) return existing;
  if (!existing.data.address) {
    return { success: false, error: "Lead has no address to geocode" };
  }

  const hit = await geocodeAddress(existing.data.address);
  if (!hit) {
    return {
      success: false,
      error:
        "Couldn't geocode this address. Try editing it to be more specific or drop the pin manually on the geofences map.",
    };
  }

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("leads")
    .update({ lat: hit.lat, lng: hit.lng })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath(`/geo/leads/${id}`);
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

  revalidatePath("/geo/leads");
  revalidatePath(`/geo/leads/${id}`);
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

  revalidatePath("/geo/leads");
  revalidatePath(`/geo/leads/${id}`);
  revalidatePath("/geo/my-leads");
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

  revalidatePath("/geo/leads");
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

  revalidatePath("/geo/leads");
  return { success: true, data: undefined };
}

interface SiblingSlot {
  id: string;
  name: string;
}

/**
 * Resolve prev/next siblings + position for the lead detail page. Same
 * scope semantics as listLeads (admin sees all, manager sees own dept +
 * unassigned, employee sees own assignments only) and the same default
 * order (updated_at DESC). Selects only id + name so the wire payload is
 * ~50 bytes/row instead of ~500 — for orgs with 500+ leads this is ~10×
 * cheaper than calling listLeads({}) on every detail render just to
 * compute the position. A future window-function CTE would cut the row
 * count to O(1); this is the no-migration path.
 */
export async function getLeadSiblings(
  currentId: string,
): Promise<
  ActionResult<{
    prev: SiblingSlot | null;
    next: SiblingSlot | null;
    position: { index: number; total: number } | null;
  }>
> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const sb = createAdminSupabase();
  let q = sb
    .from("leads")
    .select("id, name")
    .eq("org_id", ctx.orgId)
    .order("updated_at", { ascending: false });

  // Mirror the scope filter from listLeads so prev/next walks stay within
  // what the caller is allowed to read.
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
      return {
        success: true,
        data: { prev: null, next: null, position: null },
      };
    }
    q = q.or(parts.join(","));
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as unknown as SiblingSlot[];
  const idx = rows.findIndex((l) => l.id === currentId);
  if (idx < 0) {
    return {
      success: true,
      data: { prev: null, next: null, position: null },
    };
  }
  const prev = idx > 0 ? rows[idx - 1] : null;
  const next = idx < rows.length - 1 ? rows[idx + 1] : null;
  return {
    success: true,
    data: {
      prev,
      next,
      position: { index: idx + 1, total: rows.length },
    },
  };
}
