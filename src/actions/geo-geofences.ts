"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import { isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";

export const GeofenceCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["client", "office"]),
  center_lat: z.number().min(-90).max(90),
  center_lng: z.number().min(-180).max(180),
  radius_m: z.number().int().min(1).max(5000),
  notes: z.string().trim().max(1000).nullish(),
});

export const GeofenceUpdateSchema = GeofenceCreateSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export type GeofenceCreateInput = z.infer<typeof GeofenceCreateSchema>;
export type GeofenceUpdateInput = z.infer<typeof GeofenceUpdateSchema>;

interface GeofenceRow {
  id: string;
  org_id: string;
  name: string;
  type: "client" | "office";
  center_lat: number;
  center_lng: number;
  radius_m: number;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listGeofences(): Promise<ActionResult<GeofenceRow[]>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("geofences")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as GeofenceRow[] };
}

export async function createGeofence(
  input: GeofenceCreateInput,
): Promise<ActionResult<GeofenceRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const parsed = GeofenceCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("geofences")
    .insert({
      org_id: ctx.orgId,
      name: parsed.data.name,
      type: parsed.data.type,
      center_lat: parsed.data.center_lat,
      center_lng: parsed.data.center_lng,
      radius_m: parsed.data.radius_m,
      notes: parsed.data.notes ?? null,
      created_by: ctx.employeeId,
    })
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/geofences");
  revalidatePath("/dashboard/settings");
  return { success: true, data: data as GeofenceRow };
}

export async function updateGeofence(
  id: string,
  input: GeofenceUpdateInput,
): Promise<ActionResult<GeofenceRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const parsed = GeofenceUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  if (Object.keys(parsed.data).length === 0) {
    return { success: false, error: "No fields to update" };
  }

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("geofences")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/geofences");
  return { success: true, data: data as GeofenceRow };
}

export async function toggleGeofenceActive(
  id: string,
  is_active: boolean,
): Promise<ActionResult<GeofenceRow>> {
  return updateGeofence(id, { is_active });
}

export async function deleteGeofence(id: string): Promise<ActionResult<void>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const sb = createAdminSupabase();
  const { error } = await sb
    .from("geofences")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/geo/geofences");
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}
