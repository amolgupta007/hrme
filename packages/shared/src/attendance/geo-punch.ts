/**
 * Location-verified clock-in — pure geofence resolution.
 *
 * The mobile client sends only `{ lat, lng, accuracyM }`. Whether that point is
 * "at an office" is decided HERE, server-side, against the org's geofenced
 * `locations`. A client can never assert its own verdict.
 *
 * Shared (not web-only) so the same maths is available to mobile for optimistic
 * hints later, and so the boundary cases are unit-tested once.
 *
 * Plan: docs/superpowers/plans/2026-08-12-mobile-d5-geo-punch-and-prd-04-05.md
 */

export type LatLng = { lat: number; lng: number };

/** An office site with a geofence (a `locations` row that has coordinates). */
export type GeofencedSite = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Per-site override; `null` falls back to the org default radius. */
  radiusM: number | null;
};

export type GeoMatch = {
  status: "office" | "remote";
  /** The matched site, or `null` when remote. */
  matchedSiteId: string | null;
  matchedSiteName: string | null;
  /** Distance to the NEAREST site in metres (rounded), `null` when no sites. */
  distanceM: number | null;
};

/** Org-level default when a site carries no radius override. */
export const DEFAULT_GEOFENCE_RADIUS_M = 200;

/**
 * How much slack a low-confidence GPS fix is given, in metres.
 *
 * A phone reporting ±80m accuracy while sitting 220m from a 200m fence is
 * plausibly inside it, so we widen the fence by the reported accuracy. But an
 * unbounded allowance would let a garbage ±5000m fix swallow the whole city and
 * mark everything "office" — so the slack is capped here.
 */
export const MAX_ACCURACY_SLACK_M = 100;

const EARTH_RADIUS_M = 6_371_008.8; // IUGG mean earth radius

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two points in metres (haversine).
 *
 * Haversine (not a planar approximation) because it is exact enough at every
 * scale we care about and has no latitude-dependent error to reason about.
 * Accurate to ~0.5% — far tighter than consumer GPS accuracy, which is the real
 * error term in this feature.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isFiniteCoord(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** A usable point: both components finite and within valid earth ranges. */
export function isValidPoint(point: Partial<LatLng> | null | undefined): point is LatLng {
  if (!point) return false;
  const { lat, lng } = point;
  if (!isFiniteCoord(lat) || !isFiniteCoord(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Resolve a punch coordinate against the org's office geofences.
 *
 * Returns `null` — meaning "not evaluated", NOT "remote" — when:
 *  - the point is missing or out of range, or
 *  - the org has drawn no geofences yet.
 *
 * That distinction is the whole point: labelling every employee "remote" merely
 * because the admin has not yet pinned an office would be actively misleading,
 * so the verdict stays absent until there is something to verify against.
 *
 * When several geofences overlap, the NEAREST site wins (a campus with a
 * building-level fence inside a site-level fence reports the building).
 */
export function resolveGeoMatch(
  point: Partial<LatLng> | null | undefined,
  sites: readonly GeofencedSite[],
  opts?: { accuracyM?: number | null; defaultRadiusM?: number },
): GeoMatch | null {
  if (!isValidPoint(point)) return null;

  const usable = sites.filter((s) => isValidPoint(s));
  if (usable.length === 0) return null;

  const defaultRadius =
    opts?.defaultRadiusM && opts.defaultRadiusM > 0
      ? opts.defaultRadiusM
      : DEFAULT_GEOFENCE_RADIUS_M;

  // Negative/NaN accuracy is meaningless — treat as "no slack" rather than
  // trusting it to shrink or explode the fence.
  const rawAccuracy = opts?.accuracyM;
  const slack =
    isFiniteCoord(rawAccuracy) && rawAccuracy > 0
      ? Math.min(rawAccuracy, MAX_ACCURACY_SLACK_M)
      : 0;

  let nearest: { site: GeofencedSite; distance: number } | null = null;
  let matched: { site: GeofencedSite; distance: number } | null = null;

  for (const site of usable) {
    const distance = haversineMeters(point, site);
    if (!nearest || distance < nearest.distance) {
      nearest = { site, distance };
    }

    const radius =
      isFiniteCoord(site.radiusM) && site.radiusM > 0 ? site.radiusM : defaultRadius;

    if (distance <= radius + slack) {
      // Nearest matching fence wins when several contain the point.
      if (!matched || distance < matched.distance) {
        matched = { site, distance };
      }
    }
  }

  if (matched) {
    return {
      status: "office",
      matchedSiteId: matched.site.id,
      matchedSiteName: matched.site.name,
      distanceM: Math.round(matched.distance),
    };
  }

  return {
    status: "remote",
    matchedSiteId: null,
    matchedSiteName: null,
    distanceM: nearest ? Math.round(nearest.distance) : null,
  };
}

/**
 * Org-level settings for the feature, stored at
 * `organizations.settings.attendance.location_punch`.
 */
export type LocationPunchSettings = {
  enabled: boolean;
  /**
   * `optional` — ask for location; a denial or a GPS failure still records the
   * punch, just untagged.
   * `required` — the punch is rejected without coordinates. A deliberate opt-in:
   * a hard block turns any GPS failure into a can't-clock-in incident, so it
   * must be the admin's explicit choice rather than the default.
   */
  mode: "optional" | "required";
  defaultRadiusM: number;
};

export const DEFAULT_LOCATION_PUNCH_SETTINGS: LocationPunchSettings = {
  enabled: false,
  mode: "optional",
  defaultRadiusM: DEFAULT_GEOFENCE_RADIUS_M,
};

export const MIN_GEOFENCE_RADIUS_M = 25;
export const MAX_GEOFENCE_RADIUS_M = 20_000;

/**
 * Coerce whatever is in the org settings JSONB into a valid settings object.
 * Tolerant by design — a malformed blob must degrade to "feature off", never
 * throw inside the punch path.
 */
export function normalizeLocationPunchSettings(
  raw: unknown,
): LocationPunchSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_LOCATION_PUNCH_SETTINGS };
  const obj = raw as Record<string, unknown>;

  const radius = Number(obj.default_radius_m ?? obj.defaultRadiusM);
  return {
    enabled: obj.enabled === true,
    mode: obj.mode === "required" ? "required" : "optional",
    defaultRadiusM:
      Number.isFinite(radius) &&
      radius >= MIN_GEOFENCE_RADIUS_M &&
      radius <= MAX_GEOFENCE_RADIUS_M
        ? Math.round(radius)
        : DEFAULT_GEOFENCE_RADIUS_M,
  };
}
