import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { getPendingCounts } from "@/actions/notifications";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const badges = await getPendingCounts();

  return (
    <div className="flex min-h-screen">
      <Sidebar badges={badges} />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
