import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { HireNav } from "@/components/hire/hire-nav";

export default async function HireLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) redirect("/sign-in");
  if (!user.jambaHireEnabled) redirect("/dashboard/settings");

  return (
    <div className="min-h-screen bg-[#f5f4ff] dark:bg-[#0e0c1a]">
      <HireNav />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
