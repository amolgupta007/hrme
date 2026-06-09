import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { isManagerOrAbove } from "@/lib/current-user";

const LiveMap = dynamic(() => import("@/components/geo/live-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] bg-muted/30 rounded animate-pulse" />
  ),
});

export default async function LiveMapPage() {
  const ctx = await requireJambaGeoAccess();
  if (!isManagerOrAbove(ctx.role)) {
    redirect("/dashboard/geo/leads");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Field staff location data is collected only on consent via the JambaGeo
        mobile app. No web admin can enable tracking without staff opt-in.
      </p>
      <LiveMap />
    </div>
  );
}
