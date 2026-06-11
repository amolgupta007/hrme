import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { InsightsNav } from "@/components/insights/insights-nav";

export default async function InsightsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isAdmin(user.role)) redirect("/dashboard");
  if (!hasFeature(user.plan ?? "starter", "analytics", user.customFeatures ?? null)) {
    redirect("/dashboard/settings#billing");
  }

  return (
    // The Insights module deliberately owns its visual language: a dark
    // analytics canvas, independent of the app's light dashboard theme.
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Ambient glow behind the nav/hero — pure decoration */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.18),transparent_60%)]"
      />
      <InsightsNav />
      <main className="relative z-10 mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
