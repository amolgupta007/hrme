import { redirect } from "next/navigation";
import { listOffers, listAllApplications } from "@/actions/hire";
import { isAdmin } from "@/lib/current-user";
import { requireJambaHireAccess } from "@/lib/jambahire-access";
import { listDepartments } from "@/actions/departments";
import { listEmployees } from "@/actions/employees";
import { OffersClient } from "@/components/hire/offers-client";

export default async function OffersPage() {
  const access = await requireJambaHireAccess();
  if (!access.allowed) redirect("/dashboard");

  const [offersResult, appsResult, deptsResult, empsResult] = await Promise.all([
    listOffers(),
    listAllApplications(),
    listDepartments(),
    listEmployees(),
  ]);

  const offers = offersResult.success ? offersResult.data : [];
  const applications = appsResult.success ? appsResult.data : [];
  const departments = deptsResult.success ? deptsResult.data : [];
  const employees = empsResult.success ? empsResult.data : [];
  const admin = isAdmin(access.user.role);

  return (
    <OffersClient
      offers={offers}
      applications={applications}
      departments={departments}
      employees={employees as { id: string; first_name: string; last_name: string }[]}
      isAdmin={admin}
    />
  );
}
