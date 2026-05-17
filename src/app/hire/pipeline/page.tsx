import { redirect } from "next/navigation";
import { listAllApplications, listJobs, listOffers } from "@/actions/hire";
import { isAdmin } from "@/lib/current-user";
import { requireJambaHireAccess } from "@/lib/jambahire-access";
import { PipelineClient } from "@/components/hire/pipeline-client";

export default async function PipelinePage() {
  const access = await requireJambaHireAccess();
  if (!access.allowed) redirect("/dashboard");

  const [appsResult, jobsResult, offersResult] = await Promise.all([
    listAllApplications(),
    listJobs(),
    listOffers(),
  ]);

  const applications = appsResult.success ? appsResult.data : [];
  const jobs = jobsResult.success ? jobsResult.data : [];
  const offers = offersResult.success ? offersResult.data : [];
  const admin = isAdmin(access.user.role);

  return (
    <PipelineClient
      applications={applications}
      jobs={jobs}
      offers={offers}
      isAdmin={admin}
      currentEmployeeId={access.user.employeeId}
      currentRole={access.user.role}
    />
  );
}
