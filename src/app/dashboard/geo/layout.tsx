import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { GeoNav } from "@/components/geo/geo-nav";

export default async function GeoLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!hasFeature(user.plan ?? "starter", "jambageo")) {
    redirect("/dashboard/settings#billing");
  }
  if (!user.jambaGeoEnabled) {
    redirect("/dashboard/settings#jambageo");
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">JambaGeo</h1>
        <p className="text-sm text-muted-foreground">
          Field-staff tracking + lightweight lead CRM
        </p>
      </header>
      <GeoNav _isAdmin={isAdmin(user.role)} isManagerOrAbove={isManagerOrAbove(user.role)} />
      {children}
    </div>
  );
}
