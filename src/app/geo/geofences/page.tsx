import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { listGeofences } from "@/actions/geo-geofences";
import { isAdmin } from "@/lib/current-user";
import { GeoPageHeader } from "@/components/geo/geo-page-header";
import { AddGeofenceButton } from "@/components/geo/add-geofence-button";
import { GeofencePageClient } from "./client";

export default async function GeofencesPage() {
  const ctx = await requireJambaGeoAccess();
  const admin = isAdmin(ctx.role);
  const res = await listGeofences();
  const geofences = res.success ? res.data : [];

  return (
    <>
      <GeoPageHeader
        title="Geofences"
        lede="Map zones around your offices and client sites. Used to scope where the JambaGeo mobile app records visits and pings in Phase 2."
        rightSlot={<AddGeofenceButton enabled={admin} />}
      />

      {admin && (
        <div className="mb-4 rounded-md border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Three ways to add a geofence</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            <li>
              <strong className="text-foreground">From an address</strong> — click the
              &ldquo;Add geofence&rdquo; button above and type the place name.
            </li>
            <li>
              <strong className="text-foreground">Drop a pin on the map</strong> — use
              the point tool (top-right of the map) to mark a location, then name it
              in the sidebar.
            </li>
            <li>
              <strong className="text-foreground">From a lead</strong> — open any
              lead&apos;s detail page and click &ldquo;Create geofence here&rdquo;.
              Uses the lead&apos;s stored coordinates.
            </li>
          </ul>
        </div>
      )}

      <GeofencePageClient
        geofences={geofences}
        isAdmin={admin}
      />
    </>
  );
}
