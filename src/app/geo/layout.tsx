import { redirect } from "next/navigation";
import { getCurrentUser, isManagerOrAbove } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { createAdminSupabase } from "@/lib/supabase/server";
import { GeoHeader } from "@/components/geo/geo-header";

export default async function GeoLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!hasFeature(user.plan ?? "starter", "jambageo")) {
    redirect("/dashboard/settings#billing");
  }
  if (!user.jambaGeoEnabled) {
    redirect("/dashboard/settings#jambageo");
  }

  // Lightweight org-name lookup for the header context line. Single column,
  // single row. The result is cached for the duration of the render pass.
  const sb = createAdminSupabase();
  const { data: org } = await sb
    .from("organizations")
    .select("name")
    .eq("id", user.orgId)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <GeoHeader
        isManagerOrAbove={isManagerOrAbove(user.role)}
        orgName={org?.name ?? undefined}
      />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
