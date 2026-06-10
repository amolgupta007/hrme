import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { listGeofences } from "@/actions/geo-geofences";
import { isAdmin } from "@/lib/current-user";
import { GeoPageHeader } from "@/components/geo/geo-page-header";
import { GeofencePageClient } from "./client";

export default async function GeofencesPage() {
  const ctx = await requireJambaGeoAccess();
  const res = await listGeofences();
  const geofences = res.success ? res.data : [];

  return (
    <>
      <GeoPageHeader
        title="Geofences"
        lede="Map zones around your offices and client sites. Used to scope where the JambaGeo mobile app records visits and pings in Phase 2."
      />

      <GeofencePageClient
        geofences={geofences}
        isAdmin={isAdmin(ctx.role)}
      />
    </>
  );
}
