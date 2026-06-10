import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { listGeofences } from "@/actions/geo-geofences";
import { listLeads } from "@/actions/geo-leads";
import { isAdmin } from "@/lib/current-user";
import { GeoPageHeader } from "@/components/geo/geo-page-header";
import { AddGeofenceButton } from "@/components/geo/add-geofence-button";
import { PickLeadForGeofenceButton } from "@/components/geo/pick-lead-for-geofence-button";
import type { LeadSlot } from "@/components/geo/pick-lead-for-geofence-dialog";
import { GeofencePageClient } from "./client";

export default async function GeofencesPage() {
  const ctx = await requireJambaGeoAccess();
  const admin = isAdmin(ctx.role);
  const [geofenceRes, leadsRes] = await Promise.all([
    listGeofences(),
    // Only admins see the lead-picker, so we skip the leads fetch for
    // non-admins. listLeads applies the same scope as the kanban/list
    // view; the picker projects to LeadSlot below.
    admin ? listLeads({}) : Promise.resolve({ success: true, data: [] } as const),
  ]);
  const geofences = geofenceRes.success ? geofenceRes.data : [];
  const leads: LeadSlot[] = leadsRes.success
    ? leadsRes.data.map((l) => ({
        id: l.id,
        name: l.name,
        company: l.company,
        address: l.address,
        has_coords: l.lat != null && l.lng != null,
      }))
    : [];

  return (
    <>
      <GeoPageHeader
        title="Geofences"
        lede="Map zones around your offices and client sites. Used to scope where the JambaGeo mobile app records visits and pings in Phase 2."
        rightSlot={
          <div className="flex items-center gap-2">
            <PickLeadForGeofenceButton enabled={admin} leads={leads} />
            <AddGeofenceButton enabled={admin} />
          </div>
        }
      />

      {admin && (
        <div className="mb-4 rounded-md border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Three ways to add a geofence</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            <li>
              <strong className="text-foreground">From an address</strong> — click
              &ldquo;Add geofence&rdquo; and type the place name. Mapbox geocodes it
              into coordinates you can preview before saving.
            </li>
            <li>
              <strong className="text-foreground">From a lead</strong> — click
              &ldquo;From a lead&rdquo; to pick one of your saved leads. Uses the
              lead&apos;s stored coordinates (or geocodes its address on demand).
            </li>
            <li>
              <strong className="text-foreground">Drop a pin on the map</strong> — use
              the point tool (top-right of the map) to mark a location, then name it
              in the sidebar.
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
