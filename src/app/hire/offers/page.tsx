import { listOffers, listAllApplications } from "@/actions/hire";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { listDepartments } from "@/actions/departments";
import { listEmployees } from "@/actions/employees";
import { OffersClient } from "@/components/hire/offers-client";

export default async function OffersPage() {
  const [offersResult, appsResult, deptsResult, empsResult, user] = await Promise.all([
    listOffers(),
    listAllApplications(),
    listDepartments(),
    listEmployees(),
    getCurrentUser(),
  ]);

  const offers = offersResult.success ? offersResult.data : [];
  const applications = appsResult.success ? appsResult.data : [];
  const departments = deptsResult.success ? deptsResult.data : [];
  const employees = empsResult.success ? empsResult.data : [];
  const admin = user ? isAdmin(user.role) : false;

  return (
    <OffersClient
      offers={offers}
      applications={applications}
      departments={departments}
      employees={employees as any}
      isAdmin={admin}
    />
  );
}
