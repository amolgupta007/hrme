import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { isManagerOrAbove } from "@/lib/current-user";
import { GeoPageHeader } from "@/components/geo/geo-page-header";

const LiveMap = dynamic(() => import("@/components/geo/live-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] bg-muted/30 rounded animate-pulse" />
  ),
});

export default async function LiveMapPage() {
  const ctx = await requireJambaGeoAccess();
  if (!isManagerOrAbove(ctx.role)) {
    redirect("/geo/leads");
  }

  return (
    <>
      <GeoPageHeader
        title="Live map"
        lede="Field staff appear here as pins once the JambaGeo mobile app ships in Phase 2. Until then this is intentionally empty."
      />
      <div className="space-y-4">
        {/* Consent disclaimer kept inline for Pass 1; Pass 3 ($impeccable
            layout) promotes it to a structured callout. */}
        <p className="text-sm text-muted-foreground">
          Field staff location data is collected only on consent via the JambaGeo
          mobile app. No web admin can enable tracking without staff opt-in.
        </p>
        <LiveMap />
      </div>
    </>
  );
}
