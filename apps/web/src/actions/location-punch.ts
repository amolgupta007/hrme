"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { geocodeAddress } from "@/lib/geo/geocode";
import {
  normalizeLocationPunchSettings,
  MIN_GEOFENCE_RADIUS_M,
  MAX_GEOFENCE_RADIUS_M,
  type LocationPunchSettings,
} from "@jambahr/shared/attendance/geo-punch";
import type { ActionResult } from "@/types";

/**
 * Location-verified clock-in — admin configuration.
 *
 * Settings live at `organizations.settings.attendance.location_punch`; the
 * geofence itself lives on the existing `locations` rows (migration 107), so an
 * office is one record that serves biometric devices AND mobile geofencing.
 *
 * Plan: docs/superpowers/plans/2026-08-12-mobile-d5-geo-punch-and-prd-04-05.md
 */

export type GeofencedLocationRow = {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  lat: number | null;
  lng: number | null;
  geofence_radius_m: number | null;
};



export async function getLocationPunchConfig(): Promise<
  ActionResult<{ settings: LocationPunchSettings; locations: GeofencedLocationRow[] }>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const [{ data: org, error: orgErr }, { data: locs, error: locErr }] = await Promise.all([
    supabase.from("organizations").select("settings").eq("id", user.orgId).single(),
    supabase
      .from("locations")
      .select("id, name, address, is_active, lat, lng, geofence_radius_m")
      .eq("org_id", user.orgId)
      .order("created_at", { ascending: true }),
  ]);

  if (orgErr) return { success: false, error: orgErr.message };
  if (locErr) return { success: false, error: locErr.message };

  const settings = (org as { settings?: Record<string, unknown> | null })?.settings ?? {};
  const attendance = (settings.attendance ?? null) as Record<string, unknown> | null;

  return {
    success: true,
    data: {
      settings: normalizeLocationPunchSettings(attendance?.location_punch),
      locations: (locs ?? []) as unknown as GeofencedLocationRow[],
    },
  };
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["optional", "required"]),
  defaultRadiusM: z
    .number()
    .int()
    .min(MIN_GEOFENCE_RADIUS_M, `Radius must be at least ${MIN_GEOFENCE_RADIUS_M}m`)
    .max(MAX_GEOFENCE_RADIUS_M, `Radius must be at most ${MAX_GEOFENCE_RADIUS_M}m`),
});

export async function updateLocationPunchSettings(
  input: unknown,
): Promise<ActionResult<LocationPunchSettings>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const next = parsed.data;

  const supabase = createAdminSupabase();

  // `required` mode with no pinned office is pure downside: every punch without
  // coordinates is rejected, while `resolveGeoMatch` returns null for everyone
  // (no sites to match against) so nothing is ever actually verified. An
  // employee who declines the OS prompt — which iOS will not re-ask — would be
  // permanently unable to clock in, for zero benefit.
  if (next.enabled && next.mode === "required") {
    const { count, error: siteErr } = await supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", user.orgId)
      .eq("is_active", true)
      .not("lat", "is", null);

    if (siteErr) return { success: false, error: siteErr.message };
    if (!count) {
      return {
        success: false,
        error:
          "Pin at least one office location before requiring location to clock in — otherwise nobody can punch and no punch gets verified.",
      };
    }
  }

  const { data: org, error: readErr } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();
  if (readErr) return { success: false, error: readErr.message };

  // Read-modify-write the nested JSONB by hand: settings.attendance carries
  // unrelated keys (standard_workday_hours, overtime, …) that a naive overwrite
  // would silently drop.
  const settings = ((org as { settings?: Record<string, unknown> | null })?.settings ??
    {}) as Record<string, unknown>;
  const attendance = (settings.attendance ?? {}) as Record<string, unknown>;

  const { error: writeErr } = await supabase
    .from("organizations")
    .update({
      settings: {
        ...settings,
        attendance: {
          ...attendance,
          location_punch: {
            enabled: next.enabled,
            mode: next.mode,
            default_radius_m: next.defaultRadiusM,
          },
        },
      },
    } as never)
    .eq("id", user.orgId);

  if (writeErr) return { success: false, error: writeErr.message };

  revalidatePath("/dashboard/settings");
  return { success: true, data: next };
}

const geofenceSchema = z.object({
  locationId: z.string().uuid(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  radiusM: z
    .number()
    .int()
    .min(MIN_GEOFENCE_RADIUS_M)
    .max(MAX_GEOFENCE_RADIUS_M)
    .nullable()
    .optional(),
});

/**
 * Set (or clear) an office site's geofence.
 *
 * Passing `lat: null, lng: null` clears the pin — the site keeps existing for
 * biometric devices but stops participating in mobile verification.
 */
export async function setLocationGeofence(
  input: unknown,
): Promise<ActionResult<GeofencedLocationRow>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const parsed = geofenceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const { locationId, lat, lng, radiusM } = parsed.data;

  // Coordinates are all-or-nothing (mirrors the DB CHECK): a half-set pin would
  // silently never match and look like a broken feature.
  if ((lat === null) !== (lng === null)) {
    return { success: false, error: "Latitude and longitude must be set together" };
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("locations")
    .update({ lat, lng, geofence_radius_m: lat === null ? null : (radiusM ?? null) } as never)
    // org_id in the filter is the tenant guard — a tampered locationId from
    // another org matches nothing rather than updating it.
    .eq("id", locationId)
    .eq("org_id", user.orgId)
    .select("id, name, address, is_active, lat, lng, geofence_radius_m")
    .single();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Location not found" };

  revalidatePath("/dashboard/settings");
  return { success: true, data: data as unknown as GeofencedLocationRow };
}

/**
 * Resolve an office's address to coordinates so an admin can pin a site without
 * hunting for lat/lng. Reuses the India-biased forward geocoder that already
 * powers JambaGeo leads.
 */
export async function geocodeLocationAddress(
  address: string,
): Promise<ActionResult<{ lat: number; lng: number; placeName: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const result = await geocodeAddress(address);
  if (!result) {
    return {
      success: false,
      error: "Couldn't find that address. Try a more specific one, or enter coordinates directly.",
    };
  }
  return {
    success: true,
    data: { lat: result.lat, lng: result.lng, placeName: result.place_name },
  };
}
