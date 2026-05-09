import { redirect } from "next/navigation";
import { listAllApplications, listJobs } from "@/actions/hire";
import { isAdmin } from "@/lib/current-user";
import { requireJambaHireAccess } from "@/lib/jambahire-access";
import { PipelineClient } from "@/components/hire/pipeline-client";

export default async function PipelinePage() {
  const access = await requireJambaHireAccess();
  if (!access.allowed) redirect("/dashboard");

  const [appsResult, jobsResult] = await Promise.all([
    listAllApplications(),
    listJobs(),
  ]);

  const applications = appsResult.success ? appsResult.data : [];
  const jobs = jobsResult.success ? jobsResult.data : [];
  const admin = isAdmin(access.user.role);

  return <PipelineClient applications={applications} jobs={jobs} isAdmin={admin} />;
}
