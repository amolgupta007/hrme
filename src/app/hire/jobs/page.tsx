import { listJobs } from "@/actions/hire";
import { listDepartments } from "@/actions/departments";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { getOrgProfile } from "@/actions/settings";
import { JobsClient } from "@/components/hire/jobs-client";

export default async function JobsPage() {
  const [jobsResult, deptsResult, user, profileResult] = await Promise.all([
    listJobs(),
    listDepartments(),
    getCurrentUser(),
    getOrgProfile(),
  ]);

  const jobs = jobsResult.success ? jobsResult.data : [];
  const departments = deptsResult.success ? deptsResult.data : [];
  const admin = user ? isAdmin(user.role) : false;
  const orgSlug = profileResult.success ? profileResult.data.slug : "";

  return <JobsClient jobs={jobs} departments={departments} isAdmin={admin} orgSlug={orgSlug} />;
}
