// Mapbox helpers. Token is public (NEXT_PUBLIC_MAPBOX_TOKEN) but
// URL-restricted in the Mapbox console so leaking it from the bundle is acceptable.

export function getMapboxToken(): string {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    throw new Error(
      "NEXT_PUBLIC_MAPBOX_TOKEN is not set. JambaGeo maps will not render. " +
        "Generate a public token at https://account.mapbox.com/access-tokens/ " +
        "and add it to .env.local.",
    );
  }
  return token;
}

/** Geographic centre of India — used as default viewport. */
export const DEFAULT_INDIA_VIEWPORT = {
  latitude: 20.5937,
  longitude: 78.9629,
  zoom: 4,
};

/** Mapbox style URL used across JambaGeo. */
export const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";
