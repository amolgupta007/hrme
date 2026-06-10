import { redirect } from "next/navigation";
import { getCurrentUser, isManagerOrAbove } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { createAdminSupabase } from "@/lib/supabase/server";
import { GeoHeader } from "@/components/geo/geo-header";
import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
import { canUseAssistant } from "@/lib/assistant/permissions";

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

  // Mirror the DashboardLayout assistant-gating contract so the floating
  // launcher reaches this destination too. Without this the chat button is
  // only on /dashboard/* and operators inside JambaGeo have no way to ask
  // "how do I move a lead" without leaving the module. The launcher is a
  // no-op when `enabled` is false (no client env flag, org opted-out, or
  // plan-locked) so it's safe to always render.
  const assistantClientFlag = process.env.NEXT_PUBLIC_ASSISTANT_ENABLED === "true";
  const assistantAccess = canUseAssistant({
    plan: user.plan,
    role: user.role,
    orgEnabled: user.assistantEnabled,
    monthUsage: 0,
  });
  const assistantEnabled = assistantClientFlag && assistantAccess.allowed;

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <GeoHeader
        isManagerOrAbove={isManagerOrAbove(user.role)}
        orgName={org?.name ?? undefined}
      />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      <AssistantLauncher enabled={assistantEnabled} role={user.role} />
    </div>
  );
}
