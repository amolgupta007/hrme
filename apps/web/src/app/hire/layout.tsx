import { redirect } from "next/navigation";
import { requireJambaHireAccess } from "@/lib/jambahire-access";
import { isReferralsEnabled } from "@/lib/feature-flags";
import { HireNav } from "@/components/hire/hire-nav";

export default async function HireLayout({ children }: { children: React.ReactNode }) {
  const access = await requireJambaHireAccess();

  if (!access.allowed) {
    if (access.reason === "no_user") redirect("/sign-in");
    if (access.reason === "feature_disabled") redirect("/dashboard/settings");
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#f5f4ff] dark:bg-[#0e0c1a]">
      <HireNav referralsEnabled={isReferralsEnabled()} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
