import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { getPendingCounts } from "@/actions/notifications";
import { getCurrentUser } from "@/lib/current-user";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [badges, userCtx] = await Promise.all([
    getPendingCounts(),
    getCurrentUser(),
  ]);

  const role = userCtx?.role ?? "employee";

  return (
    <div className="flex min-h-screen">
      <Sidebar badges={badges} role={role} />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
