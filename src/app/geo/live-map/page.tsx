import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
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
        {/* Consent contract as a structured callout, not a footnote. In
            Phase 1 the map is empty by design — this banner is what
            tells the operator the absence is intentional and DPDP-clean,
            not a bug or a loading state. */}
        <div
          role="note"
          aria-label="Consent and privacy contract"
          className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 p-4"
        >
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-primary"
            aria-hidden
          />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">
              Consent-first tracking
            </h2>
            <p className="text-sm text-muted-foreground">
              Field staff location data is collected only on opt-in via the
              JambaGeo mobile app. Web admins cannot enable tracking on a
              staff member&apos;s behalf — the contract lives on the device.
              When Phase 2 ships, on-duty staff who have opted in will appear
              here as live pins.
            </p>
          </div>
        </div>
        <LiveMap />
      </div>
    </>
  );
}
