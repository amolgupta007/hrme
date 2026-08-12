import { getMapboxToken } from "@/lib/mapbox";

export interface ReverseGeocodeResult {
  /** Neighbourhood / locality, e.g. "Andheri East". Null when unresolved. */
  locality: string | null;
  /** City / town, e.g. "Mumbai". Null when unresolved. */
  city: string | null;
  /** Mapbox's full normalized place name for the nearest feature. */
  placeName: string;
  /** Best short label for UI: "Andheri East, Mumbai" (falls back sensibly). */
  label: string;
}

/**
 * Reverse-geocode a coordinate to a human place via Mapbox Geocoding API v5.
 *
 * The mirror of `geocodeAddress` in ./geocode.ts and deliberately identical in
 * its failure posture: returns null on no result, network error, missing token,
 * timeout, or any non-2xx. Callers treat null as "we know they were off-site but
 * not where" — the punch is still recorded and still labelled remote.
 *
 * Only called for punches that fell OUTSIDE every office geofence, so Mapbox
 * calls scale with exceptions rather than with total punch volume (an office
 * match already has a better label: the site's own name).
 *
 * `types` is narrowed to neighbourhood/locality/place because the label we want
 * is "Andheri East, Mumbai", not a street address — we are deliberately coarse
 * here: recording the exact doorstep of an employee's home would be a DPDP
 * problem we have no reason to take on.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  let token: string;
  try {
    token = getMapboxToken();
  } catch {
    return null;
  }

  // Mapbox reverse geocoding takes {longitude},{latitude} — in that order.
  // 5dp ≈ 1.1 m, plenty for a locality lookup and it keeps the URL stable
  // enough for any future response caching.
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng.toFixed(5)},${lat.toFixed(5)}.json`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  url.searchParams.set("types", "neighborhood,locality,place");

  try {
    const res = await fetch(url.toString(), {
      // Best-effort: a punch must never wait on a slow geocoder.
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      features?: Array<{
        place_name?: string;
        text?: string;
        place_type?: string[];
        context?: Array<{ id?: string; text?: string }>;
      }>;
    };

    const top = json.features?.[0];
    if (!top?.place_name) return null;

    const kind = top.place_type?.[0] ?? "";
    const context = top.context ?? [];
    const fromContext = (prefix: string) =>
      context.find((c) => c.id?.startsWith(`${prefix}.`))?.text ?? null;

    // The top feature is itself either the neighbourhood/locality or the city;
    // whichever it is, the other comes from its context chain.
    const isPlace = kind === "place";
    const locality = isPlace ? null : (top.text ?? null);
    const city = isPlace
      ? (top.text ?? null)
      : (fromContext("place") ?? fromContext("district"));

    const label =
      locality && city && locality !== city
        ? `${locality}, ${city}`
        : (city ?? locality ?? top.place_name);

    return { locality, city, placeName: top.place_name, label };
  } catch {
    return null;
  }
}
