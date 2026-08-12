import type { createAdminSupabase } from "@/lib/supabase/server";
import {
  normalizeLocationPunchSettings,
  resolveGeoMatch,
  type GeofencedSite,
  type LocationPunchSettings,
  DEFAULT_LOCATION_PUNCH_SETTINGS,
} from "@jambahr/shared/attendance/geo-punch";
import type { MobilePunchGeo } from "@jambahr/shared/mobile/types";
import { reverseGeocode } from "@/lib/geo/reverse-geocode";

type Supabase = ReturnType<typeof createAdminSupabase>;

/**
 * Location-verified clock-in — server-side resolution.
 *
 * A plain module, NOT "use server": every export from a "use server" file
 * becomes a browser-callable RPC, and this one reads org config and employee
 * coordinates (gotcha #85, same reasoning as late-policy-dispatch.ts).
 *
 * Plan: docs/superpowers/plans/2026-08-12-mobile-d5-geo-punch-and-prd-04-05.md
 */

/** The DB columns a resolved punch stamps onto `attendance_punch_events`. */
export type ResolvedPunchLocation = {
  geo_status: "office" | "remote" | null;
  matched_location_id: string | null;
  geo_label: string | null;
};

export const UNRESOLVED_LOCATION: ResolvedPunchLocation = {
  geo_status: null,
  matched_location_id: null,
  geo_label: null,
};

/**
 * Read `organizations.settings.attendance.location_punch`.
 *
 * Any read failure degrades to "feature off" rather than throwing — this sits
 * directly in the punch path, and a settings hiccup must never cost someone
 * their clock-in.
 */
export async function loadLocationPunchSettings(
  supabase: Supabase,
  orgId: string,
): Promise<LocationPunchSettings> {
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle();

    if (error || !data) return { ...DEFAULT_LOCATION_PUNCH_SETTINGS };

    const settings = (data as { settings?: Record<string, unknown> | null }).settings;
    const attendance = (settings?.attendance ?? null) as Record<string, unknown> | null;
    return normalizeLocationPunchSettings(attendance?.location_punch);
  } catch {
    return { ...DEFAULT_LOCATION_PUNCH_SETTINGS };
  }
}

/** Active office sites in the org that carry a geofence (lat/lng set). */
export async function loadGeofencedSites(
  supabase: Supabase,
  orgId: string,
): Promise<GeofencedSite[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, lat, lng, geofence_radius_m")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .not("lat", "is", null);

  if (error || !data) return [];

  return (data as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "Office"),
    lat: Number(row.lat),
    lng: Number(row.lng),
    radiusM:
      row.geofence_radius_m === null || row.geofence_radius_m === undefined
        ? null
        : Number(row.geofence_radius_m),
  }));
}

/**
 * Resolve a punch coordinate into the verdict stored on the punch event.
 *
 * Never throws: any failure — bad coordinates, unreachable DB, Mapbox down —
 * collapses to `UNRESOLVED_LOCATION` so the punch itself still records. A
 * missing tag is a cosmetic gap; a rejected punch is an incident.
 *
 * `office` labels come from the site's own name (no geocoding needed and more
 * useful than a street). `remote` labels are reverse-geocoded best-effort.
 */
export async function resolvePunchLocation(
  supabase: Supabase,
  orgId: string,
  point: { lat?: number | null; lng?: number | null; accuracyM?: number | null },
  settings: LocationPunchSettings,
): Promise<ResolvedPunchLocation> {
  if (!settings.enabled) return { ...UNRESOLVED_LOCATION };
  if (point.lat === null || point.lat === undefined) return { ...UNRESOLVED_LOCATION };
  if (point.lng === null || point.lng === undefined) return { ...UNRESOLVED_LOCATION };

  try {
    const sites = await loadGeofencedSites(supabase, orgId);
    const match = resolveGeoMatch(
      { lat: point.lat, lng: point.lng },
      sites,
      { accuracyM: point.accuracyM ?? null, defaultRadiusM: settings.defaultRadiusM },
    );

    // No geofences configured (or an unusable point) → deliberately unevaluated,
    // NOT "remote". See resolveGeoMatch's contract.
    if (!match) return { ...UNRESOLVED_LOCATION };

    if (match.status === "office") {
      return {
        geo_status: "office",
        matched_location_id: match.matchedSiteId,
        geo_label: match.matchedSiteName,
      };
    }

    const place = await reverseGeocode(point.lat, point.lng);
    return {
      geo_status: "remote",
      matched_location_id: null,
      geo_label: place?.label ?? null,
    };
  } catch {
    return { ...UNRESOLVED_LOCATION };
  }
}

/** Map a stored punch row's geo columns onto the mobile DTO. */
export function toPunchGeoDto(row: {
  geo_status?: string | null;
  geo_label?: string | null;
  matched_location_id?: string | null;
}): MobilePunchGeo | null {
  const status = row.geo_status;
  if (status !== "office" && status !== "remote") return null;
  return {
    status,
    label: row.geo_label ?? null,
    siteName: status === "office" ? (row.geo_label ?? null) : null,
  };
}
