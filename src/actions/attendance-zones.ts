"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";

export type ZoneRow = {
  id: string;
  name: string;
  location_ids: string[];
  location_names: string[];
};

export type ZoneAssignmentRow = {
  employee_id: string;
  zone_id: string;
  zone_name: string;
  effective_from: string;
};

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" as const };
  if (!isAdmin(user.role)) return { error: "Unauthorized" as const };
  return { user };
}

// ---------------- Zones ----------------

export async function listZones(): Promise<ActionResult<ZoneRow[]>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("attendance_zones")
    .select("id, name, attendance_zone_locations(location_id, locations(name))")
    .eq("org_id", ctx.user.orgId)
    .order("created_at", { ascending: true });

  if (error) return { success: false, error: error.message };
  const rows: ZoneRow[] = (data ?? []).map((z: any) => {
    const links = (z.attendance_zone_locations ?? []) as any[];
    return {
      id: z.id,
      name: z.name,
      location_ids: links.map((l) => l.location_id),
      location_names: links.map((l) => l.locations?.name).filter(Boolean),
    };
  });
  return { success: true, data: rows };
}

const zoneSchema = z.object({
  name: z.string().trim().min(1, "Zone name is required").max(120),
  location_ids: z.array(z.string().uuid()).default([]),
});

export async function createZone(input: {
  name: string;
  location_ids: string[];
}): Promise<ActionResult<ZoneRow>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const parsed = zoneSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const supabase = createAdminSupabase();
  const { data: zone, error } = await supabase
    .from("attendance_zones")
    .insert({ org_id: ctx.user.orgId, name: parsed.data.name })
    .select("id, name")
    .single();

  if (error || !zone) return { success: false, error: error?.message ?? "Failed to create zone" };

  await setZoneLocations(supabase, (zone as any).id, parsed.data.location_ids);
  revalidatePath("/dashboard/settings");
  return listOneZone((zone as any).id);
}

export async function updateZone(
  id: string,
  patch: { name?: string; location_ids?: string[] },
): Promise<ActionResult<ZoneRow>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const supabase = createAdminSupabase();

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return { success: false, error: "Zone name is required" };
    const { error } = await supabase
      .from("attendance_zones")
      .update({ name })
      .eq("id", id)
      .eq("org_id", ctx.user.orgId);
    if (error) return { success: false, error: error.message };
  }

  if (patch.location_ids !== undefined) {
    // Guard cross-org tampering: confirm the zone belongs to the caller's org.
    const { data: owned } = await supabase
      .from("attendance_zones")
      .select("id")
      .eq("id", id)
      .eq("org_id", ctx.user.orgId)
      .maybeSingle();
    if (!owned) return { success: false, error: "Zone not found" };
    await setZoneLocations(supabase, id, patch.location_ids);
  }

  revalidatePath("/dashboard/settings");
  return listOneZone(id);
}

export async function deleteZone(id: string): Promise<ActionResult<void>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const supabase = createAdminSupabase();
  // zone_locations + employee_zone_assignments cascade on zone delete.
  const { error } = await supabase
    .from("attendance_zones")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.user.orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

// ---------------- Employee assignment ----------------

export async function listZoneAssignments(): Promise<ActionResult<ZoneAssignmentRow[]>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("employee_zone_assignments")
    .select("employee_id, zone_id, effective_from, created_at, attendance_zones(name)")
    .eq("org_id", ctx.user.orgId)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  // Latest assignment per employee = the current one.
  const seen = new Set<string>();
  const rows: ZoneAssignmentRow[] = [];
  for (const a of (data ?? []) as any[]) {
    if (seen.has(a.employee_id)) continue;
    seen.add(a.employee_id);
    rows.push({
      employee_id: a.employee_id,
      zone_id: a.zone_id,
      zone_name: a.attendance_zones?.name ?? "",
      effective_from: a.effective_from,
    });
  }
  return { success: true, data: rows };
}

export async function assignEmployeeToZone(input: {
  employee_id: string;
  zone_id: string;
  effective_from?: string; // defaults to today (IST)
}): Promise<ActionResult<void>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const supabase = createAdminSupabase();
  // Confirm the zone is in the caller's org.
  const { data: zone } = await supabase
    .from("attendance_zones")
    .select("id")
    .eq("id", input.zone_id)
    .eq("org_id", ctx.user.orgId)
    .maybeSingle();
  if (!zone) return { success: false, error: "Zone not found" };

  const effFrom = input.effective_from ?? istToday();
  const { error } = await supabase.from("employee_zone_assignments").insert({
    org_id: ctx.user.orgId,
    employee_id: input.employee_id,
    zone_id: input.zone_id,
    effective_from: effFrom,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

export async function unassignEmployeeFromZones(
  employeeId: string,
): Promise<ActionResult<void>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("employee_zone_assignments")
    .delete()
    .eq("org_id", ctx.user.orgId)
    .eq("employee_id", employeeId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

// ---------------- helpers ----------------

async function setZoneLocations(
  supabase: ReturnType<typeof createAdminSupabase>,
  zoneId: string,
  locationIds: string[],
): Promise<void> {
  await supabase.from("attendance_zone_locations").delete().eq("zone_id", zoneId);
  if (locationIds.length > 0) {
    await supabase
      .from("attendance_zone_locations")
      .insert(locationIds.map((location_id) => ({ zone_id: zoneId, location_id })));
  }
}

async function listOneZone(id: string): Promise<ActionResult<ZoneRow>> {
  const all = await listZones();
  if (!all.success) return all;
  const zone = all.data.find((z) => z.id === id);
  if (!zone) return { success: false, error: "Zone not found after save" };
  return { success: true, data: zone };
}

function istToday(): string {
  // YYYY-MM-DD in Asia/Kolkata.
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
