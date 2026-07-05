import { getMapboxToken } from "@/lib/mapbox";

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** Mapbox's normalized place name, e.g. "Andheri East, Mumbai, India". */
  place_name: string;
  /** Mapbox's confidence proxy: distance between geometry centre and query.
   *  Higher is worse. Useful for downstream "uncertain match" callouts. */
  relevance: number;
}

/**
 * Forward-geocode a free-text address via Mapbox Geocoding API v5.
 *
 * Returns null on:
 * - No result (the address didn't match anything)
 * - Network error
 * - Token not configured
 * - Any 4xx/5xx response
 *
 * All callers should treat null as "geocoding unavailable for this address"
 * and either fall back to text-only handling or surface a hint that the
 * admin can re-try / drop the pin manually.
 *
 * Biased toward India (`country=IN` + India-centered proximity) so a query
 * like "MG Road" doesn't return MG Road in some other country.
 *
 * Server-callable; uses NEXT_PUBLIC_MAPBOX_TOKEN which already powers the
 * maps. Mapbox's free tier covers 100k geocoding requests/month; well past
 * any practical SMB volume.
 */
export async function geocodeAddress(
  address: string | null | undefined,
): Promise<GeocodeResult | null> {
  if (!address) return null;
  const trimmed = address.trim();
  if (!trimmed) return null;

  let token: string;
  try {
    token = getMapboxToken();
  } catch {
    return null;
  }

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "IN");
  url.searchParams.set("limit", "1");
  // India centroid for proximity bias — addresses ambiguous between IN and
  // other countries lean Indian.
  url.searchParams.set("proximity", "78.9629,20.5937");
  url.searchParams.set("types", "address,place,locality,neighborhood,poi");

  try {
    const res = await fetch(url.toString(), {
      // Best-effort: don't block lead creation on slow geocoding.
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: Array<{
        center: [number, number];
        place_name: string;
        relevance?: number;
      }>;
    };
    const top = json.features?.[0];
    if (!top) return null;
    const [lng, lat] = top.center;
    return {
      lat,
      lng,
      place_name: top.place_name,
      relevance: top.relevance ?? 0,
    };
  } catch {
    return null;
  }
}
