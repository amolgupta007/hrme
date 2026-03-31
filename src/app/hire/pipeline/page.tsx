import { listAllApplications, listJobs } from "@/actions/hire";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { PipelineClient } from "@/components/hire/pipeline-client";

export default async function PipelinePage() {
  const [appsResult, jobsResult, user] = await Promise.all([
    listAllApplications(),
    listJobs(),
    getCurrentUser(),
  ]);

  const applications = appsResult.success ? appsResult.data : [];
  const jobs = jobsResult.success ? jobsResult.data : [];
  const admin = user ? isAdmin(user.role) : false;

  return <PipelineClient applications={applications} jobs={jobs} isAdmin={admin} />;
}
