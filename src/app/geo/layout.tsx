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
      {/* Skip-to-content for keyboard users. sr-only by default; appears
          as a focused chip at top-left when Tab lands on it from the URL
          bar. Targets the <main> below, which carries the matching id
          and tabIndex so focus actually moves on activation. */}
      <a
        href="#geo-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-md focus:bg-amber-500 focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-900"
      >
        Skip to content
      </a>
      <GeoHeader
        isManagerOrAbove={isManagerOrAbove(user.role)}
        orgName={org?.name ?? undefined}
      />
      <main
        id="geo-main"
        tabIndex={-1}
        className="mx-auto max-w-7xl px-6 py-8 focus:outline-none"
      >
        {children}
      </main>
      <AssistantLauncher enabled={assistantEnabled} role={user.role} />
    </div>
  );
}
