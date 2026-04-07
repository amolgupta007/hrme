import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { redirect } from "next/navigation";
import { listGrievances, getGrievanceStats } from "@/actions/grievances";
import { GrievancesClient } from "@/components/grievances/grievances-client";

export default async function GrievancesPage() {
  const user = await getCurrentUser();

  if (!user?.grievancesEnabled) {
    redirect("/dashboard/settings");
  }

  const isManager = isAdmin(user.role);

  const [listResult, statsResult] = await Promise.all([
    listGrievances(),
    isManager ? getGrievanceStats() : Promise.resolve(null),
  ]);

  const grievances = listResult.success ? listResult.data : [];
  const stats = statsResult?.success ? statsResult.data : null;

  return (
    <GrievancesClient
      grievances={grievances}
      stats={stats}
      isManager={isManager}
      employeeId={user.employeeId}
    />
  );
}
