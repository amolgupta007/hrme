import { listJobs } from "@/actions/hire";
import { listDepartments } from "@/actions/departments";
import { getCurrentUser } from "@/lib/current-user";
import { isAdmin } from "@/lib/current-user";
import { JobsClient } from "@/components/hire/jobs-client";

export default async function JobsPage() {
  const [jobsResult, deptsResult, user] = await Promise.all([
    listJobs(),
    listDepartments(),
    getCurrentUser(),
  ]);

  const jobs = jobsResult.success ? jobsResult.data : [];
  const departments = deptsResult.success ? deptsResult.data : [];
  const admin = user ? isAdmin(user.role) : false;
  const orgSlug = ""; // Will be populated from org profile if needed

  return <JobsClient jobs={jobs} departments={departments} isAdmin={admin} />;
}
