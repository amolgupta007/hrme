import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { InsightsNav } from "@/components/insights/insights-nav";
import { getMyOrgs } from "@/actions/active-org";

export default async function InsightsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isAdmin(user.role)) redirect("/dashboard");
  if (!hasFeature(user.plan ?? "starter", "analytics", user.customFeatures ?? null)) {
    redirect("/dashboard/settings#billing");
  }

  const memberships = await getMyOrgs();
  const eligibleOrgs = memberships
    .filter((m) => m.role === "owner" || m.role === "admin")
    .map((m) => ({ id: m.orgId, name: m.name }));

  return (
    // The Insights module deliberately owns its visual language: a dark
    // analytics canvas, independent of the app's light dashboard theme.
    <div id="insights-root" className="min-h-screen bg-slate-950 text-slate-100">
      {/* Ambient glow behind the nav/hero — pure decoration */}
      <div
        aria-hidden="true"
        className="print-hide pointer-events-none fixed inset-x-0 top-0 z-0 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.18),transparent_60%)]"
      />
      <InsightsNav eligibleOrgs={eligibleOrgs} activeOrgId={user.orgId} />
      <main className="relative z-10 mx-auto max-w-7xl px-6 py-8">
        {/* Print-only report masthead — the on-screen nav is hidden in print,
            so exported PDFs carry the brand through this block instead. */}
        <div className="mb-6 hidden items-center gap-3 border-b border-slate-200 pb-4 print:flex">
          <Image src="/Jamba.png" alt="JambaHR" width={36} height={36} className="rounded-lg" />
          <div>
            <p className="text-base font-bold">JambaHR — Org Insights</p>
            <p className="text-xs">
              Generated{" "}
              {new Date().toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              · jambahr.com
            </p>
          </div>
        </div>
        {children}
        <footer className="mt-12 border-t border-white/5 pt-4">
          <p className="flex items-center gap-2 text-xs text-slate-600">
            <Image
              src="/Jamba.png"
              alt=""
              width={16}
              height={16}
              className="rounded opacity-70"
            />
            Powered by <span className="font-medium text-slate-500">JambaHR</span>
            <span className="text-slate-700">·</span>
            <span>jambahr.com</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
