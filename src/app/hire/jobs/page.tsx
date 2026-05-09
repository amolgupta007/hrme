import { redirect } from "next/navigation";
import { listJobs } from "@/actions/hire";
import { listDepartments } from "@/actions/departments";
import { isAdmin } from "@/lib/current-user";
import { requireJambaHireAccess } from "@/lib/jambahire-access";
import { getOrgProfile } from "@/actions/settings";
import { JobsClient } from "@/components/hire/jobs-client";

export default async function JobsPage() {
  const access = await requireJambaHireAccess();
  if (!access.allowed) redirect("/dashboard");

  const [jobsResult, deptsResult, profileResult] = await Promise.all([
    listJobs(),
    listDepartments(),
    getOrgProfile(),
  ]);

  const jobs = jobsResult.success ? jobsResult.data : [];
  const departments = deptsResult.success ? deptsResult.data : [];
  const admin = isAdmin(access.user.role);
  const orgSlug = profileResult.success ? profileResult.data.slug : "";

  return <JobsClient jobs={jobs} departments={departments} isAdmin={admin} orgSlug={orgSlug} />;
}
