import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { listGeofences } from "@/actions/geo-geofences";
import { isAdmin } from "@/lib/current-user";
import { GeofencePageClient } from "./client";

export default async function GeofencesPage() {
  const ctx = await requireJambaGeoAccess();
  const res = await listGeofences();
  const geofences = res.success ? res.data : [];

  return (
    <GeofencePageClient
      geofences={geofences}
      isAdmin={isAdmin(ctx.role)}
    />
  );
}
