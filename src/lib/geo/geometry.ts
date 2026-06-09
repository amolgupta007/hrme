/**
 * Haversine distance between two lat/lng points in metres.
 * Used by isPointInGeofence and (later) lead-proximity queries.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeofenceCircle {
  center_lat: number;
  center_lng: number;
  radius_m: number;
}

/**
 * True iff (lat, lng) is inside the geofence circle.
 * Inclusive at the boundary.
 */
export function isPointInGeofence(
  lat: number,
  lng: number,
  fence: GeofenceCircle,
): boolean {
  return haversineMeters(lat, lng, fence.center_lat, fence.center_lng) <= fence.radius_m;
}

/**
 * Format a radius in metres for display (e.g. "500 m", "1.2 km").
 */
export function formatGeofenceRadius(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
