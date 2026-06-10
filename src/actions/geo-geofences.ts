"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getJambaGeoContext } from "@/lib/jambageo-access";
import { isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";
import {
  GeofenceCreateSchema,
  GeofenceUpdateSchema,
  type GeofenceCreateInput,
  type GeofenceUpdateInput,
} from "@/lib/geo/geo-schemas";
import { geocodeAddress, type GeocodeResult } from "@/lib/geo/geocode";

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

  revalidatePath("/geo/geofences");
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

  revalidatePath("/geo/geofences");
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

  revalidatePath("/geo/geofences");
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

/**
 * Forward-geocode a free-text address (Mapbox v5 places API, biased toward
 * India). Used by the "Add geofence from address" flow on /geo/geofences
 * to convert "Andheri MIDC, Mumbai" → lat/lng before showing the confirm
 * step. Returns null when the address can't be matched; the dialog falls
 * back to a hint asking the admin to drop the pin manually.
 */
export async function geocodeGeofenceAddress(
  address: string,
): Promise<ActionResult<GeocodeResult>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };
  const hit = await geocodeAddress(address);
  if (!hit) {
    return {
      success: false,
      error:
        "Couldn't find that address. Try making it more specific (city, area, landmark) or drop the pin manually on the map.",
    };
  }
  return { success: true, data: hit };
}

/**
 * Convenience: create a geofence at a lead's location. Resolves the lead's
 * stored lat/lng if present, else geocodes the lead's address on demand.
 * If neither is available, returns a guidance error so the UI can tell the
 * admin what to do (add an address or drop the pin manually).
 *
 * The geofence's name defaults to "{lead name} ({company})" when no name
 * is provided; the admin can rename later via the geofence list.
 */
export async function createGeofenceFromLead(input: {
  lead_id: string;
  name?: string;
  type?: "client" | "office";
  radius_m?: number;
}): Promise<ActionResult<GeofenceRow>> {
  const ctx = await getJambaGeoContext();
  if (!ctx) return { success: false, error: "Not authorized" };
  if (!isAdmin(ctx.role)) return { success: false, error: "Admin only" };

  const sb = createAdminSupabase();
  const { data: lead, error: leadErr } = await sb
    .from("leads")
    .select("name, company, address, lat, lng")
    .eq("id", input.lead_id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (leadErr) return { success: false, error: leadErr.message };
  if (!lead) return { success: false, error: "Lead not found" };

  let lat = lead.lat as number | null;
  let lng = lead.lng as number | null;

  // If the lead has an address but no coords, try geocoding once.
  if ((lat == null || lng == null) && lead.address) {
    const hit = await geocodeAddress(lead.address);
    if (hit) {
      lat = hit.lat;
      lng = hit.lng;
      // Backfill the lead so future calls don't re-geocode.
      await sb
        .from("leads")
        .update({ lat, lng })
        .eq("id", input.lead_id)
        .eq("org_id", ctx.orgId);
    }
  }

  if (lat == null || lng == null) {
    return {
      success: false,
      error:
        "This lead doesn't have a usable location. Add an address (geocoded automatically) or drop the pin manually on the geofences map.",
    };
  }

  const fallbackName = lead.company
    ? `${lead.name} (${lead.company})`
    : lead.name;

  const { data, error } = await sb
    .from("geofences")
    .insert({
      org_id: ctx.orgId,
      name: input.name?.trim() || fallbackName,
      type: input.type ?? "client",
      center_lat: lat,
      center_lng: lng,
      radius_m: input.radius_m ?? 200,
      created_by: ctx.employeeId,
    })
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/geo/geofences");
  revalidatePath("/dashboard/settings");
  return { success: true, data: data as GeofenceRow };
}
